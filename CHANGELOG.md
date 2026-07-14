# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.7] - 2026-07-14

### Fixed
- **Research file viewer path duplication**: the `/api/research/file` endpoint
  resolved `path.resolve(RESEARCH_ROOT, relPath)` where `RESEARCH_ROOT` already
  ended with `/research` and `relPath` (stored in DB columns like `texPath`)
  also started with `research/`. The resolved path became
  `<project>/research/research/hypotheses/H-XXXX.tex` and the file was not
  found. The endpoint now strips the leading `research/` (or `research\`) from
  `relPath` before resolving, so both `research/hypotheses/H-XXXX.tex` and
  `hypotheses/H-XXXX.tex` work.
- **`.tex` files were downloaded instead of displayed inline**: the MIME type
  for `.tex` was `application/x-tex`, which browsers do not know how to render
  and therefore download. Changed to `text/plain; charset=utf-8` so the LaTeX
  source is shown as plain text in a new browser tab. `Content-Disposition:
  inline` (already present) ensures display instead of download.
- **Path traversal vulnerability in `/api/research/file`**: a previous fix
  that changed `RESEARCH_ROOT = path.join(PROJECT_ROOT, 'research')` to
  `RESEARCH_ROOT = PROJECT_ROOT` (to work around the duplication bug above)
  also disabled the security check that prevented serving arbitrary files
  from the project root. Reverted `RESEARCH_ROOT` to
  `path.join(PROJECT_ROOT, 'research')` and added `relPath` normalization
  instead. Added `X-Content-Type-Options: nosniff` to all responses to
  prevent MIME sniffing. Requests like `?path=../package.json` or
  `?path=.env` now correctly return 403.
- **Hypotheses were missing `texPath` / `pdfPath` columns**: the `Hypothesis`
  model in `prisma/schema.prisma` lacked these fields, so the frontend could
  not build links to the `.tex` (and `.pdf`) artifacts. Added both columns
  as `String?` (optional) and applied via `prisma db push`. A backfill script
  (`scripts/backfill_hypothesis_paths.js`) populated `texPath` for previously
  created hypotheses whose `.tex` file still exists on disk.

### Added
- **`.tex` and `.pdf` action buttons on the Hypotheses tab**: each hypothesis
  card now shows a `.tex` button (and a `.pdf` button when `pdfPath` is set)
  that opens the artifact in a new browser tab. The path stored in the DB is
  normalized (leading `research/` stripped, backslashes converted to forward
  slashes) before being passed to `/api/research/file`, so the URL is
  well-formed on Windows as well as Linux/macOS.
- **`texPath` persisted on hypothesis creation**: both `generateHypothesis()`
  in `src/lib/agent/hypothesis-generator.ts` and the `inject-hypothesis`
  branch of `applyDirective()` in `src/lib/agent/orchestrator.ts` now persist
  `texPath: rel(texAbs)` to the database at creation time. Previously the
  path was computed and returned to the caller but never written to the DB,
  so the button did not appear for newly created hypotheses.
- **404 response now includes the requested `path`** for easier debugging:
  `{"error":"not found","path":"hypotheses/H-XXXX.tex"}` instead of just
  `{"error":"not found"}`.

### Security
- `/api/research/file` now correctly enforces that the resolved absolute path
  stays inside `RESEARCH_ROOT` (`<project>/research/`). Combined with the
  `relPath` normalization, this prevents path-traversal attacks while still
  accepting both prefixed (`research/foo.tex`) and unprefixed (`foo.tex`)
  paths from the database.

## [1.0.6] - 2026-07-13

### Fixed
- **Halt/Resume deadlock**: the `resume` owner directive could never be
  applied once the agent entered halt mode, because `applyQueuedDirectives()`
  ran after the `isHalted` early-return in `runCycle()`. The toggle got
  stuck on "Resume" (green) forever and the agent kept logging
  `agent is halted by owner — skipping cycle` even across process restarts.
  The directive queue is now drained at the top of every cycle, before any
  early-return, so `resume` always reaches its handler.
- **Lost directives on restart**: directives with `status='queued'` in the
  DB were orphaned when the process restarted (the in-memory queue was
  wiped). They are now recovered in `ensureAgentState()` at boot.
- **Slow resume**: the `resume` directive previously had to wait up to 60s
  (or 300s at low priority) for the next scheduled cycle to be applied.
  It now triggers `setImmediate(applyQueuedDirectives)` and `scheduleCycle(0)`,
  so the agent resumes within ~1s.
- **Silent directive rejections**: unknown directive kinds and thrown
  errors in `applyDirective` were swallowed silently; the UI showed a green
  "Directive accepted" toast that lied. The web server now validates the
  `kind` and emits `directive-rejected` with a reason; the UI shows a red
  toast with the reason.

### Added
- `Orchestrator.isKnownDirectiveKind(kind)` public method — used by the
  web server to reject unknown directive kinds at the WS layer.
- `directive-rejected` socket event — emitted by the server with
  `{kind, reason}`, consumed by the client to show a toast.

