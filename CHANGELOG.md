# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
