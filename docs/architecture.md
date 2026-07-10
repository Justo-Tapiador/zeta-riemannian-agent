# zRiemannian — Architecture

This document is a deeper companion to the [README](../README.md). It
covers the internal architecture of zRiemannian at the module level, the
data model, the event protocol, and the Riemann-alert state machine.

---

## 1. Process topology

zRiemannian consists of two cooperating processes:

| Process | Port | Responsibility |
|---------|------|----------------|
| **Next.js dev server** | 3000 | Web dashboard (UI + read-only file API) |
| **agent-runtime** (mini-service) | 3003 | WebSocket server + the orchestrator + the AJN cycle loop |

A **Caddy gateway** on port 81 routes:
- requests with `?XTransformPort=3003` → port 3003 (the agent runtime)
- everything else → port 3000 (Next.js)

The dashboard's WebSocket client connects to `/?XTransformPort=3003`,
which Caddy forwards to the agent runtime. All real-time communication
happens over this single socket.

A supervisor script (`scripts/supervise-agent.sh`) wraps the agent runtime
and restarts it if it crashes. The supervisor itself is started with
`setsid` so it survives shell-session teardown.

---

## 2. Module map

```
src/lib/agent/
├── types.ts               # shared TypeScript interfaces
├── logger.ts              # structured logger + in-memory ring buffer
├── ajn-backbone.ts        # 14-layer ANN-Psi backbone specification
├── llm-router.ts          # multi-LLM task-routed router (ZAI + adapters)
├── arxiv-adapter.ts       # ArXiv API + caching + summarisation
├── latex-compiler.ts      # tectonic wrapper
├── document-archivist.ts  # hierarchical LaTeX storage + templates
├── knowledge-graph.ts     # KG nodes + edges + RH seed
├── hypothesis-generator.ts
├── proof-attempter.ts
├── proof-verifier.ts
├── theorem-archivist.ts
├── riemann-prober.ts      # *** the central RH prober + alert ***
├── json-utils.ts          # robust JSON extractor for LaTeX-in-JSON
└── orchestrator.ts        # main autonomous loop
```

### Dependency graph

```
orchestrator
  ├── ajn-backbone        (symbolic layer firings)
  ├── llm-router          (task-routed multi-LLM)
  ├── knowledge-graph     (concept activations)
  ├── arxiv-adapter       (preprint intake)
  ├── hypothesis-generator ─┐
  ├── proof-attempter ──────┤── llm-router
  │                         ├── document-archivist
  │                         └── latex-compiler
  ├── proof-verifier ───────┘
  ├── theorem-archivist ── document-archivist + latex-compiler
  └── riemann-prober ───── llm-router + document-archivist + latex-compiler
```

All modules log through the shared `logger.ts`, which maintains a
500-entry ring buffer. The agent-runtime mini-service polls this ring
every 500 ms and emits any new events to all connected WebSocket clients.

---

## 3. Data model (Prisma schema)

The Prisma schema (`prisma/schema.prisma`) defines 10 models:

| Model | Purpose |
|-------|---------|
| `Hypothesis` | A proposed mathematical claim (status: open → attempted → proven / disproven / abandoned) |
| `ProofAttempt` | An attempted proof of a hypothesis (verdict: pending → valid / invalid / inconclusive) |
| `Theorem` | A promoted, verified theorem — a reusable tool |
| `RiemannAttempt` | A periodic attempt to prove the Riemann Hypothesis itself |
| `ArxivPaper` | A cached ArXiv preprint with relevance score and summary |
| `KGNode` | A node in the mathematical knowledge graph |
| `KGEdge` | A directed edge between KG nodes (relation: generalises, implies, uses, constrains, …) |
| `AgentCycle` | One cycle of the autonomous loop |
| `OwnerDirective` | A human-issued directive (queued for application) |
| `AgentState` | Global singleton: isRunning, isHalted, **riemannProven**, focusTopic, counters |

The `AgentState.riemannProven` flag is the **sacred bit** — once set, the
agent enters alert-only mode.

---

## 4. The cycle loop

The orchestrator's `runCycle()` method is the heart of the agent. It is
called on startup with zero delay (AJN addiction) and rescheduled every
`CYCLE_INTERVAL_MS` (default 60 s).

```
runCycle()
  │
  ├── 1. Apply queued owner directives
  ├── 2. Pick phase based on cycle id:
  │      cycle % 5 == 0  → riemann-attempt
  │      cycle % 3 == 0  → arxiv-scan
  │      cycle % 7 == 0  → archive
  │      else             → hypothesis-gen (even) | proof-attempt (odd)
  ├── 3. Create AgentCycle row in DB
  ├── 4. Fire backbone layers L1-L3 (sensory + pattern)
  ├── 5. Execute the phase:
  │      ├── arxiv-scan       → searchArxiv + cacheArxivHit + attachSummary
  │      ├── hypothesis-gen   → generateHypothesis (LLM)
  │      ├── proof-attempt    → pickOpenHypothesis + attemptProof (LLM) + verifyProof (LLM)
  │      │                      → if valid & conf ≥ 0.75: promoteToTheorem
  │      ├── riemann-attempt  → attemptRiemannProof (LLM) + verifyRiemannProof (LLM)
  │      │                      → if valid & conf ≥ 0.90: SET riemannProven = true
  │      └── archive          → regenerate research/INDEX.md
  ├── 6. Fire backbone layers L4-L14 (symbolic)
  └── 7. Reschedule next cycle
```

### Phase picker rationale

The phase picker cycles through the four productive phases
(`arxiv-scan`, `hypothesis-gen`, `proof-attempt`, `archive`) while
ensuring every 5th cycle is a `riemann-attempt`. This gives the agent a
roughly 1:1:1:1 ratio of ArXiv scanning, hypothesis generation, proof
attempts, and archiving, with a periodic RH probe layered on top.

---

## 5. The LLM call protocol

Every LLM call goes through `llm-router.call()`, which:

1. Logs the call with a sequential id.
2. Wraps the ZAI `chat.completions.create()` in a `Promise.race` against
   a 90-second timeout.
3. On success, returns `{ text, model, provider, tokensIn, tokensOut, durationMs }`.
4. On error or timeout, falls back to a deterministic stub (clearly
   tagged so the UI shows degraded mode).

The caller (e.g. `hypothesis-generator`) then parses the response with
`safeJsonParse()`, which:

1. Extracts the first `{...}` block from the text.
2. Tries to parse it raw.
3. If that fails, repairs LaTeX-style backslashes (e.g. `\zeta` →
   `\\zeta`) inside string literals and retries.

This handles the common case where the LLM returns valid JSON wrapped in
markdown code fences, or valid JSON containing un-escaped LaTeX commands.

---

## 6. The Riemann-alert state machine

```
                  ┌─────────────────────────────────────────┐
                  │                                         │
                  ▼                                         │
            ┌──────────┐                            ┌──────────────┐
            │ RUNNING  │ ── riemann attempt ──────► │ RIEMANN      │
            │ (normal) │    verdict=valid           │ PROVEN MODE  │
            └──────────┘    conf ≥ 0.90             └──────────────┘
                │                                          │
                │ owner: halt                              │ re-broadcast
                ▼                                          │ alert every 15s
            ┌──────────┐                                   │
            │ HALTED   │ ◄───────── owner: resume ─────────┘
            │ (paused) │   (only if riemannProven === false)
            └──────────┘
```

Once `riemannProven === true`, the agent will **not** resume hypothesis
generation even if the owner sends `resume`. The owner must explicitly
acknowledge the finding (e.g. by reading the archived proof and then
shutting down the agent). This is by design: a proof of the Riemann
Hypothesis is not something the agent should quietly move past.

---

## 7. The WebSocket event protocol

The agent-runtime emits the following event types to all connected
clients:

| Event kind | When |
|------------|------|
| `cycle-start` / `cycle-end` | At the beginning and end of each cycle |
| `phase-change` | When the phase is picked |
| `arxiv-fetched` | When ArXiv preprints are cached |
| `hypothesis-proposed` | When a new hypothesis is created |
| `proof-started` / `proof-finished` | When a proof attempt begins and ends |
| `theorem-promoted` | When a hypothesis is promoted to a theorem |
| `riemann-attempt-started` / `riemann-attempt-finished` | When a Riemann attempt begins and ends |
| **`riemann-proven`** | *** When a Riemann attempt passes the threshold *** |
| `llm-call` / `llm-error` | When an LLM call is made or fails |
| `doc-written` / `pdf-compiled` | When a LaTeX file or PDF is written |
| `kg-updated` | When the knowledge graph is updated |
| `owner-directive-applied` / `owner-directive-rejected` | When a directive is processed |
| `log` / `error` | Generic logging |

Each event has: `kind`, `message`, `cycleId?`, `phase?`, `payload?`,
`timestamp`, `level?` (`info` | `warn` | `error` | `debug` | `critical`).

The `riemann-proven` event is the only one with `level: 'critical'`. The
dashboard's alert banner is triggered by `snapshot.riemannProven === true`
(the snapshot is broadcast every 5 seconds), not by the event itself — so
even a client that connects after the alert will see it immediately.

---

## 8. The document archivist

The `document-archivist.ts` module is responsible for all file I/O. It:

1. Resolves the project root by walking up from `__dirname` until it
   finds a directory with both `package.json` and `prisma/`. This makes
   the archive location independent of which process imports the module
   (Next.js dev server vs. agent-runtime vs. CLI).
2. Maintains 5 subdirectories under `research/`:
   `hypotheses/`, `proofs/`, `theorems/`, `arxiv-cache/`, `riemann-attempts/`.
3. Generates short codes in the format `<PREFIX>-YYYY-NNNN` (e.g.
   `H-2026-0001`, `PA-2026-0001`, `T-2026-0001`, `RH-2026-0001`).
4. Provides LaTeX templates for each document type, with consistent
   preamble (`amsmath`, `amssymb`, `amsthm`, `mathtools`, `hyperref`,
   `microtype`) and theorem environments.

Each document has a sidecar `.meta.json` (and, for proofs, a
`.verifier.json`) with the full context: LLM model, provider, cycle id,
raw draft, compile log, etc.

---

## 9. The knowledge graph seed

On first launch, the agent seeds its knowledge graph with 20 canonical
RH-related concepts and 19 edges between them. The seed includes:

**Nodes:** riemann-hypothesis, zeta-function, xi-function, critical-line,
critical-strip, functional-equation, explicit-formula,
prime-number-theorem, dirichlet-L-functions, selberg-class,
hilbert-polya, random-matrix-theory, weil-explicit-formula,
converse-theorem, automorphic-forms, spectral-theory,
analytic-continuation, hadamard-product, mertens-conjecture,
li-criterion.

**Edges** (sample): `xi-function —[completes]→ zeta-function`,
`functional-equation —[symmetrises-across]→ critical-line`,
`weil-explicit-formula —[is-equivalent-to]→ riemann-hypothesis`,
`hilbert-polya —[would-imply]→ riemann-hypothesis`,
`li-criterion —[is-equivalent-to]→ riemann-hypothesis`.

These activations are fed into the hypothesis generator's prompt to bias
generation toward RH-related concepts.

---

## 10. Failure modes and graceful degradation

| Failure | Behaviour |
|---------|-----------|
| ZAI SDK init fails | Router logs a warning; all calls fall back to deterministic stubs. Agent continues running. |
| LLM call times out (>90s) | Router catches the timeout, falls back to stub. Agent continues. |
| LLM returns unparseable JSON | `safeJsonParse` tries raw parse, then LaTeX-repaired parse. If both fail, the caller uses a fallback draft (clearly tagged). |
| `tectonic` not installed | `compileTex` returns `{ ok: false }`. The `.tex` file is still written; only the `.pdf` is missing. |
| ArXiv API returns error | `searchArxiv` returns `[]`. The cycle continues with no new preprints. |
| Proof verifier returns `inconclusive` | The proof attempt is not promoted. The hypothesis stays in `attempted` status. |
| Riemann verifier returns `valid` but confidence < 0.90 | The attempt is logged as `valid` in the DB but `riemannProven` is NOT set. The agent continues normally. |
| Agent-runtime crashes | The supervisor (`scripts/supervise-agent.sh`) restarts it within 3 seconds. The DB state is preserved. |

---

## 11. Extension points

The agent is designed to be extended. Likely extension points:

- **New LLM providers**: add an adapter in `llm-router.ts` and a
  provider info entry in `listProviders()`.
- **New ArXiv sources**: add query terms to `RH_QUERY_TERMS` in
  `arxiv-adapter.ts`, or add a new source (e.g. HAL, MathSciNet) by
  implementing the same `searchX()` interface.
- **New proof strategies**: add to the `STRATEGIES` array in
  `riemann-prober.ts`.
- **New KG seeds**: add to `SEED_NODES` and `SEED_EDGES` in
  `knowledge-graph.ts`.
- **New document types**: add a template function in
  `document-archivist.ts` and a phase in `orchestrator.ts`.
- **New owner directives**: add a kind to `OwnerDirectivePayload` in
  `types.ts` and a case in `applyDirective()` in `orchestrator.ts`.
