
<p align="center">
  <img src="https://raw.githubusercontent.com/Justo-Tapiador/zeta-riemannian-agent/v1.0.0/docs/zr-3.jpg" alt="zRiemannian-agent" width="640" />
</p>
# THE ZETA-RIEMANNIAN AGENT (:zRiemannian) v1.0

**An Autonomous Mathematical Research Agent for the Riemann Hypothesis**

> *Build, attempt, and archive mathematical hypotheses related to the
> Riemann Hypothesis — autonomously, around the clock, the moment it is
> launched. When — and only when — a verifier-accepted proof of RH is
> produced, halt everything and alert the human owner.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.0-orange.svg)](https://bun.sh)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)

---

## Table of Contents

- [Overview](#overview)
- [Key Principles](#key-principles)
- [The Six Mathematical Tasks](#the-six-mathematical-tasks)
- [Architecture](#architecture)
- [The Artificial Junky Neuron (AJN)](#the-artificial-junky-neuron-ajn)
- [The 14-Layer ANN-Psi Backbone](#the-14-layer-ann-psi-backbone)
- [Multi-LLM Integration](#multi-llm-integration)
- [ArXiv Integration](#arxiv-integration)
- [Document Generation & Hierarchical Archive](#document-generation--hierarchical-archive)
- [The Riemann Alert](#the-riemann-alert)
- [Owner Guidance](#owner-guidance)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Autonomous Research](#autonomous-research)
  - [Web Dashboard](#web-dashboard)
  - [Owner Directives](#owner-directives)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Lineage & Credits](#lineage--credits)
- [License](#license)

---

## Overview

**zeta-riemannian-agent** (alias **:zRiemannian**) is an autonomous AI
research agent that, upon launch, immediately begins producing mathematical
documents — hypotheses, proof attempts, theorems, and periodic attempts at
the Riemann Hypothesis itself. It does **not** wait for an owner directive;
this is the core property of the **Artificial Junky Neuron (AJN)**
framework on which it is built.

The agent was created by **dramatically re-targeting and extending**
[`quantum-spherifier`](https://github.com/Justo-Tapiador/quantum-spherifier)
(which targeted quantum computing research), which in turn extended
[`fusionary-agent`](https://github.com/Justo-Tapiador/fusionary-agent)
(nuclear fusion). Both inherit from the original
**`predator-jungle-agent`** v2.0 by Justo Tapiador Garcia (Universidad de
Alicante), which defines the AJN architecture.

### What makes zRiemannian different

| Feature | quantum-spherifier | **zeta-riemannian-agent** |
|---------|--------------------|---------------------------|
| Domain | Quantum computing (QEC, qubits, algorithms, simulation) | **Pure mathematics — Riemann Hypothesis** |
| Research target | Multi-line (4 lines, cross-linked) | **Single conjecture** (RH) with satellite hypotheses |
| Document format | LaTeX (research notes) + patent drafts | **LaTeX only** (hypotheses, proofs, theorems, RH attempts) + compiled PDF |
| Central probe | Patent-cluster readiness | **Periodic full proof attempts of the Riemann Hypothesis** |
| Alert mode | Patent filing ready | **RIEMANN-PROVEN MODE** — halts all research and broadcasts a critical alert |
| Knowledge graph | Quantum hardware + algorithms | **Mathematical concepts** around ξ(s), the critical line, the Selberg class, the Hilbert–Pólya operator, etc. |
| Verifier threshold | Per-task confidence | **0.75** for theorem promotion · **0.90** for RH promotion (adversarial) |
| Web dashboard | 8 tabs | **9 tabs** (added dedicated Riemann-attempt log + AJN backbone inspector) |

---

## Key Principles

1. **Autonomous activation (AJN addiction)** — On launch, zRiemannian
   immediately starts researching. It does not wait for a request. This is
   the defining "addiction" property of the Artificial Junky Neuron.

2. **A single central conjecture** — The Riemann Hypothesis is the
   gravitational centre of the agent's research. Every satellite hypothesis
   is biased toward either (a) generalising RH, (b) approaching it from a
   new angle, or (c) producing a tool that could help prove it.

3. **Periodic central probes** — Every 5th cycle is a **Riemann attempt**:
   the agent tries to produce a full proof of RH using its accumulated
   theorem toolkit. Each attempt is independently verified by an
   adversarial pass with a 0.90 confidence threshold.

4. **The archive is the long-term memory** — Successfully proven hypotheses
   are promoted to **theorems**, tagged, indexed, and stored in
   `research/theorems/`. They become reusable tools for future proof
   attempts. Nothing is lost; everything is searchable.

5. **ArXiv as ground truth** — The agent periodically scans ArXiv for
   preprints related to RH, caches them locally, summarises them, and uses
   them as inspiration and citation for its own hypotheses.

6. **The alert is sacred** — When — and only when — a Riemann attempt
   passes the verifier, the agent **halts all hypothesis creation** and
   enters **RIEMANN-PROVEN MODE**: a pulsing red banner appears on every
   page, console logs scream, the LaTeX and PDF are sealed under
   `research/riemann-attempts/`, and the agent does nothing else until the
   human owner acknowledges.

7. **Multi-LLM task routing** — Different cognitive tasks use the most
   appropriate frontier LLM: GLM-4.6 for hypothesis generation and proof
   sketching, GLM-4.6 again for adversarial verification, with automatic
   failover to OpenAI, Anthropic, Google Gemini, and DeepSeek when API
   keys are present.

---

## The Six Mathematical Tasks

These are the exclusively mathematical tasks of zRiemannian, as specified in
the project brief:

1. **Creation of hypotheses related to the central conjecture.** The agent
   proposes new, well-formed mathematical hypotheses connected to RH —
   either by generalising it, by approaching it from a new angle, or by
   providing a tool that could help prove it. Each hypothesis is written
   as a LaTeX document and archived under `research/hypotheses/`.

2. **Access to mathematical preprint libraries.** The agent queries the
   ArXiv API for preprints related to RH (zeta zeros, critical line,
   functional equation, Selberg class, Hilbert–Pólya, random matrix
   theory, explicit formulae, etc.). Each cached preprint has its abstract
   saved, is summarised by the LLM, and is given a relevance score.

3. **Attempted proof of the proposed hypothesis.** Each cycle, the agent
   picks an open hypothesis and asks the LLM to produce a LaTeX proof
   attempt, using the available theorem toolkit and ArXiv references as
   tools. The proof is compiled to PDF via `tectonic`.

4. **Promotion of proven hypotheses to theorems.** A second LLM pass —
   the adversarial verifier — inspects each proof attempt. If the verdict
   is `valid` with confidence ≥ 0.75, the hypothesis is promoted to a
   **theorem**: tagged, indexed, and stored under `research/theorems/`
   with both `.tex` and `.pdf`. The theorem becomes a reusable tool for
   future proof attempts.

5. **Periodic attempts at the central conjecture.** Every 5th cycle is a
   **Riemann attempt**: the agent tries to produce a full proof of RH
   using its accumulated theorem toolkit. Each attempt uses one of ten
   predefined proof strategies (Weil explicit formula, Hilbert–Pólya
   operator, Selberg-class equality, Li coefficients, random-matrix
   bootstrap, converse theorems, spectral interpretation, modular forms,
   Jensen positivity, p-adic interpolation).

6. **The Riemann alert.** When — and only when — a Riemann attempt passes
   the adversarial verifier with confidence ≥ 0.90, the agent:
   - sets the global `riemannProven` flag,
   - halts all hypothesis creation and proof attempts,
   - writes the LaTeX source and compiled PDF to
     `research/riemann-attempts/`,
   - broadcasts a `riemann-proven` event with `level: 'critical'` on the
     WebSocket,
   - displays a pulsing red banner on the web dashboard,
   - re-broadcasts the alert every 15 seconds until the owner acknowledges.

---

## Architecture

zRiemannian is a **14-layer ANN-Psi backbone** (AJN + Transformer) wrapped
in a research-cycle orchestrator, backed by a multi-LLM router, a
mathematical knowledge graph, an ArXiv adapter, and a hierarchical document
archive. The whole system is served by a Next.js 16 web dashboard and a
WebSocket mini-service.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Owner Guidance Layer                          │
│   Web Dashboard (Next.js 16 + shadcn/ui)  ·  WebSocket           │
└───────────────────────┬─────────────────────────────────────────┘
                        │ ws://?XTransformPort=3003
┌───────────────────────▼─────────────────────────────────────────┐
│              Agent Runtime (mini-service, port 3003)             │
│   Socket.io server · event fan-out · directive receiver          │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                  ZRiemannianAgent (orchestrator)                 │
│  cycle loop · phase picker · owner-directive queue · snapshot    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│              ANN-Psi Backbone (14 layers)                        │
│  L1-L2 Hybrid AJN · L3 Hetero AJN K=8 · L4-L5 Transformer       │
│  L6 Hetero AJN K=16 · L7 Hybrid AJN · L8-L9 Transformer         │
│  L10 Hetero AJN K=32 · L11 Hybrid AJN · L12 Hetero AJN K=8      │
│  L13 Hybrid AJN · L14 Output AJN                                 │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│              LLM Router (task-routed multi-LLM)                  │
│  ZAI/GLM-4.6 (primary) · OpenAI GPT-4o · Claude Opus 4.1 ·      │
│  Gemini 2.0 Pro · DeepSeek-R1 · Local (Ollama)                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┬─────────────┐
         ▼              ▼              ▼             ▼
┌──────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Hypothesis   │ │ Proof      │ │ Theorem    │ │ Riemann    │
│ Generator    │ │ Attempter  │ │ Archivist  │ │ Prober     │
└──────┬───────┘ └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
       │                │              │              │
       └────────┬───────┴───────┬──────┴──────────────┘
                ▼               ▼
        ┌──────────────┐ ┌──────────────┐
        │ ArXiv        │ │ Knowledge    │
        │ Adapter      │ │ Graph        │
        └──────┬───────┘ └──────────────┘
               │
               ▼
        ┌──────────────┐
        │ Document     │
        │ Archivist    │  ──► research/hypotheses/  (H-YYYY-NNNN.tex)
        │ + tectonic   │  ──► research/proofs/      (PA-YYYY-NNNN.tex + .pdf)
        │              │  ──► research/theorems/    (T-YYYY-NNNN.tex + .pdf)
        │              │  ──► research/arxiv-cache/ (abstracts + summaries)
        │              │  ──► research/riemann-attempts/ (RH-YYYY-NNNN.tex + .pdf)
        └──────────────┘
```

---

## The Artificial Junky Neuron (AJN)

The **Artificial Junky Neuron (AJN)** is the defining architectural
primitive inherited from `predator-jungle-agent`. An AJN neuron is
"addicted" to its task domain: it fires autonomously when the agent is
launched and does NOT wait for an external request.

In zRiemannian, this means: the moment you run `bun run dev` on the
`mini-services/agent-runtime/`, the orchestrator's `start()` method is
called, which immediately schedules the first cycle with **zero delay**.
There is no "warm-up", no "waiting for the first request" — the agent
begins producing mathematical hypotheses within seconds of launch.

The AJN addiction is encoded structurally in the orchestrator:

```typescript
// mini-services/agent-runtime/index.ts
(async () => {
  await llmRouter.init();
  await orchestrator.start();  // <-- AJN addiction engages here
})();

// src/lib/agent/orchestrator.ts
async start() {
  // ...
  this.scheduleCycle(0);  // <-- zero delay = fire immediately
}
```

The `ajnAddictionPolicy` in `ajn-backbone.ts` returns `true` whenever a
cycle is active — the neuron always wants to fire. The orchestrator
controls the only override: when the agent is halted (by owner directive
or by RIEMANN-PROVEN MODE), the cycle loop pauses.

---

## The 14-Layer ANN-Psi Backbone

| Layer | Name | Kind | Role |
|-------|------|------|------|
| L1 | Sensory-A | AJN-Hybrid | ArXiv abstract intake |
| L2 | Sensory-B | AJN-Hybrid | Knowledge-graph delta intake |
| L3 | Pattern-8 | AJN-Hetero K=8 | Multi-head pattern detection across cache |
| L4 | Attn-Lo-1 | Transformer | Long-range self-attention over hypotheses |
| L5 | Attn-Lo-2 | Transformer | Hypothesis cluster formation |
| L6 | XL-16 | AJN-Hetero K=16 | Cross-link synthesis: theorems ↔ hypotheses |
| L7 | Strategy | AJN-Hybrid | Proof-strategy selection |
| L8 | Sketch-1 | Transformer | Proof-sketch generation |
| L9 | Sketch-2 | Transformer | Proof-sketch refinement |
| L10 | Verify-32 | AJN-Hetero K=32 | Deep verification routing |
| L11 | Verdict | AJN-Hybrid | Verdict aggregation |
| L12 | Archive | AJN-Hetero K=8 | Archival decision |
| L13 | RH-Trigger | AJN-Hybrid | Riemann-prober trigger evaluation |
| L14 | Emit | Output-AJN | Final emission: doc / event / alert |

In this TypeScript re-implementation we keep the **layer schema** and the
**hetero/hybrid K-pattern** of the original predator-jungle-agent backbone,
but the actual computation is delegated to a task-routed multi-LLM
ensemble (see [Multi-LLM Integration](#multi-llm-integration)). Each
"layer" is a function that consumes the upstream context vector (a
structured object) and augments it, mirroring the predator-jungle-agent
convention of treating the context as a rolling symbolic state.

---

## Multi-LLM Integration

zRiemannian uses a **task-routed multi-LLM ensemble**, mirroring the
quantum-spherifier pattern. Each cognitive task is dispatched to the most
appropriate frontier LLM available in the runtime.

### Task routing

| Task | Primary | Purpose |
|------|---------|---------|
| `hypothesis-gen` | GLM-4.6 | Creative, broad — propose new hypotheses |
| `proof-sketch` | GLM-4.6 | Long-form reasoning — produce LaTeX proof body |
| `proof-verify` | GLM-4.6 | Adversarial self-check — verdict on proof attempts |
| `arxiv-summarise` | GLM-4.6 | Fast compression — summarise ArXiv abstracts |
| `riemann-attempt` | GLM-4.6 | Frontier reasoning — full RH proof attempt |
| `riemann-verify` | GLM-4.6 | Double-adversarial — highest-stakes verdict |
| `kg-synthesise` | GLM-4.6 | Concept-graph maintenance |
| `freeform` | GLM-4.6 | General purpose |

### Failover chain

The router is wired around the **z-ai-web-dev-sdk** (which exposes Z.ai's
GLM-4.6 family), with pluggable adapters for OpenAI, Anthropic, Google
Gemini, and DeepSeek when API keys are present. If the primary ZAI call
errors or times out (90s), the router falls back to a deterministic stub
so the agent can still produce *something* — clearly tagged in the UI so
the owner knows creative generation is degraded.

### Configuration

Set any of these environment variables in `.env` to enable additional
providers (see `.env.example`):

```
# ZAI is auto-available in this sandbox; no key needed.
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...
```

---

## ArXiv Integration

The `arxiv-adapter.ts` module queries the public ArXiv API
(`http://export.arxiv.org/api/query`) using a rotating set of RH-related
search terms:

- "Riemann hypothesis"
- "Riemann zeta function zeros"
- "critical line"
- "critical strip"
- "functional equation zeta"
- "xi function"
- "explicit formula"
- "Dirichlet L-function zeros"
- "prime number theorem"
- "Selberg class"
- "random matrix zeta"
- "Hilbert–Pólya"
- "Weil explicit formula"
- "converse theorem L-function"

Each fetched preprint is:
- given a relevance score (0.5 baseline, +0.3 if title mentions "Riemann"
  or "zeta", +0.2 if abstract mentions "critical line"),
- summarised by the LLM in 2–3 sentences emphasising RH relevance,
- cached in the `ArxivPaper` table and exposed in the dashboard's **ArXiv**
  tab.

---

## Document Generation & Hierarchical Archive

All mathematical artefacts are produced as LaTeX and compiled to PDF via
`tectonic` (a modern, self-contained XeTeX-based compiler). The local
archive lives under `research/` and is organised hierarchically:

```
research/
├── INDEX.md                          # auto-regenerated top-level index
├── hypotheses/
│   ├── H-2026-0001.tex               # one TeX file per proposed hypothesis
│   ├── H-2026-0001.meta.json         # sidecar metadata
│   └── ...
├── proofs/
│   ├── PA-2026-0001.tex              # one TeX file per proof attempt
│   ├── PA-2026-0001.pdf              # compiled PDF (when tectonic is available)
│   ├── PA-2026-0001.meta.json        # sidecar metadata
│   ├── PA-2026-0001.verifier.json    # verifier report sidecar
│   └── ...
├── theorems/
│   ├── T-2026-0001.tex               # promoted theorem (verified proof)
│   ├── T-2026-0001.pdf
│   ├── T-2026-0001.tags.json         # auto-inferred tags
│   └── ...
├── arxiv-cache/
│   ├── <arxivId>.abstract.txt        # cached abstract
│   └── <arxivId>.summary.md          # agent-generated summary
├── riemann-attempts/
│   ├── RH-2026-0001.tex              # periodic full RH proof attempt
│   ├── RH-2026-0001.pdf
│   ├── RH-2026-0001.verifier.json    # adversarial verifier report
│   └── ...
└── cross_refs.json                   # global cross-reference map (planned)
```

Each LaTeX document is a self-contained `article` with `amsmath`,
`amssymb`, `amsthm`, `mathtools`, `hyperref`, and `microtype`. Hypotheses
declare a `hypothesis` theorem environment; theorems declare a `theorem`
environment; proofs are wrapped in `proof` environments. The `INDEX.md`
file is regenerated every 7th cycle (the `archive` phase) to give a
human-readable summary of the entire archive.

### Tags

Theorems are auto-tagged based on their statement and proof approach.
Tags include: `critical-line`, `critical-strip`, `xi-function`,
`zeta-function`, `functional-equation`, `explicit-formula`, `l-functions`,
`selberg-class`, `hilbert-polya`, `random-matrix`, `complex-analysis`,
`proof-by-contradiction`, `proof-by-induction`, `spectral-theory`,
`misc`.

---

## The Riemann Alert

This is the most important behavioural contract of zRiemannian.

When a Riemann attempt is judged `valid` by the adversarial verifier with
confidence ≥ 0.90 (`RH_PROMOTION_THRESHOLD`), the agent enters
**RIEMANN-PROVEN MODE**:

1. The global `AgentState.riemannProven` flag is set to `true`.
2. `AgentState.isHalted` is set to `true` — the autonomous cycle loop
   pauses.
3. A `riemann-proven` event with `level: 'critical'` is broadcast on the
   WebSocket.
4. The web dashboard displays a **pulsing red banner** at the top of every
   page:
   ```
   *** RIEMANN HYPOTHESIS PROVEN ***
   zRiemannian has produced a verifier-accepted proof of the Riemann
   Hypothesis at <timestamp>. All autonomous hypothesis creation has been
   halted. The LaTeX source and PDF are archived under
   research/riemann-attempts/. Please review immediately.
   ```
5. The agent re-broadcasts the alert every 15 seconds until the owner
   acknowledges or shuts it down.
6. The LaTeX source and compiled PDF of the successful attempt are sealed
   under `research/riemann-attempts/<shortCode>.tex` and `.pdf`.

The threshold of 0.90 is intentionally very high. The verifier prompt
instructs the LLM to be maximally skeptical: "Only return `valid` if the
proof would survive peer review at Annals of Mathematics." In practice this
means the alert will fire very rarely — which is the correct behaviour for
a conjecture that has resisted proof for over 160 years.

---

## Owner Guidance

Although zRiemannian is autonomous by design (AJN addiction), the human
owner can guide it through the **Guidance** tab of the web dashboard.
Directives are queued and applied at the start of the next cycle.

| Directive | Effect |
|-----------|--------|
| `set-focus` | Bias hypothesis generation toward a specific topic (e.g. "Hilbert–Pólya operator construction"). |
| `halt` | Pause the autonomous cycle loop. The agent stays alive and accepts further directives. |
| `resume` | Unpause the cycle loop. |
| `force-riemann-attempt` | Trigger a Riemann attempt immediately, outside the normal 5-cycle cadence. |
| `inject-hypothesis` | Inject a specific hypothesis (title, statement, motivation) bypassing LLM generation. |
| `rerun-cycle` | Force the next cycle to run immediately. |
| `shutdown` | Stop the orchestrator entirely. |

The `inject-hypothesis` directive is particularly useful for owners who
want to test a specific mathematical idea without waiting for the LLM to
propose it. The injected hypothesis is immediately available for proof
attempts on the next cycle.

---

## Installation

### Prerequisites

- **Node.js** ≥ 18 (or **Bun** ≥ 1.0 — recommended)
- **tectonic** (LaTeX engine) — optional but recommended for PDF compilation
  - Install: <https://tectonic-typesetting.github.io/book/en/installation.html>
- An SQLite database (auto-created by Prisma)

### Steps

```bash
# Clone the repository
git clone https://github.com/Justo-Tapiador/zeta-riemannian-agent.git
cd zeta-riemannian-agent

# Install dependencies
bun install   # or: npm install

# Set up environment variables (optional — ZAI is auto-available)
cp .env.example .env
# edit .env to add OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.

# Push the Prisma schema to create the SQLite database
bun run db:push

# Verify tectonic is available (optional)
which tectonic
```

---

## Quick Start

```bash
# Single command — starts the native Node.js web server AND the agent
# (the agent is embedded in web/server.js — no separate process needed)
bun run web
```

Or equivalently:

```bash
bun web/server.js
```

Open <http://localhost:3000> in your browser. You should see the
zRiemannian dashboard with the **Overview** tab active. Within seconds,
the **● live** badge should appear in the header, the **cycle #** counter
should increment, and the **Activity** tab should start filling with
events.

### Native Node.js web server (no Next.js, no React)

The web dashboard is served by a **single-file native Node.js HTTP server**
at `web/server.js` — plain HTML + vanilla JS + CSS, no build step. The
server:

1. Serves static files from `web/public/` (`index.html`, `css/style.css`,
   `js/app.js`, the logos `zr-1.png` and `zr-2.png`).
2. Boots the zRiemannian orchestrator **in-process** (the AJN addiction
   loop runs inside the same Node.js process as the HTTP server).
3. Hosts a Socket.io server (path `/socket.io/`) that streams every agent
   event to connected browsers in real time.
4. Serves LaTeX/PDF artifacts from `research/` via
   `/api/research/file?path=...`.
5. Exposes a JSON snapshot at `/api/snapshot`.

The HTML page (`web/public/index.html`) is a single-file dashboard with
9 tabs, all implemented in vanilla JavaScript (`web/public/js/app.js`).
No React, no JSX, no compilation — you can edit the HTML/CSS/JS directly
and refresh the browser to see the changes.

### Logos

Two logos are embedded:
- **`web/public/zr-1.png`** (resized to `zr-1-small.png` at 200px wide)
  appears in the top-left header next to the title.
- **`web/public/zr-2.png`** (resized to `zr-2-small.png` at 180px wide)
  appears centered at the bottom of the page, just above the footer.

### Running with plain Node.js (without bun)

If you don't have bun installed, you can run the server with plain Node.js
— but you'll need to compile the TypeScript agent modules first:

```bash
# One-time: compile the TypeScript sources to JavaScript
npx tsc src/lib/agent/*.ts src/lib/db.ts --outDir dist --module commonjs --target es2020 --esModuleInterop --skipLibCheck

# Then run the server (you'll need to adjust the require() paths in
# web/server.js to point to dist/ instead of src/lib/)
node web/server.js
```

**Recommendation:** just install bun — it's 40 MB and handles TypeScript
natively, so `bun web/server.js` "just works" without any compilation
step.

The agent will:
1. Seed its knowledge graph with 20 canonical RH-related concepts.
2. Start its first cycle (phase = `proof-attempt` or `hypothesis-gen`).
3. Generate a hypothesis, attempt a proof, verify it, and archive the
   result.
4. Every 3rd cycle, scan ArXiv for new preprints.
5. Every 5th cycle, attempt a full proof of the Riemann Hypothesis.
6. Every 7th cycle, regenerate `research/INDEX.md`.

---

## Usage

### Autonomous Research

By default, zRiemannian runs autonomously. Just launch the runtime and
let it work. You can monitor its progress through:

- The **Activity** tab — live event stream.
- The **Hypotheses** tab — every proposed hypothesis, with status
  (`open`, `attempted`, `proven`, `disproven`, `abandoned`), confidence,
  related concepts, and related ArXiv IDs.
- The **Theorems** tab — every promoted theorem, with tags, dependencies,
  and links to the `.tex` and `.pdf` files.
- The **Riemann** tab — every periodic RH proof attempt, with verdict,
  confidence, and links to the LaTeX and PDF.
- The **ArXiv** tab — every cached preprint, with relevance score and
  agent-generated summary.
- The **Knowledge** tab — the mathematical knowledge graph (nodes and
  edges).
- The **AJN** tab — the 14-layer backbone specification, with each
  layer's kind, K value, and role.

### Web Dashboard

The dashboard is built with **Next.js 16**, **Tailwind CSS 4**, and
**shadcn/ui**. It connects to the agent runtime via WebSocket (Socket.io)
and receives real-time updates. The dark theme is inspired by terminal
editors and Bloomberg-style financial dashboards — the goal is to make
every cycle, every hypothesis, and every Riemann attempt visible at a
glance.

The most important UI element is the **Riemann alert banner**: a
full-width, pulsing red bar that appears at the top of every page when
`AgentState.riemannProven === true`. It cannot be dismissed by the agent
— only by the owner acknowledging and halting the agent.

### Owner Directives

See [Owner Guidance](#owner-guidance) above. Directives are sent via
WebSocket from the **Guidance** tab and queued for application at the
start of the next cycle.

---

## Configuration

Configuration is via environment variables (`.env` file) and the Prisma
schema (`prisma/schema.prisma`).

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:/home/z/my-project/db/custom.db` | SQLite database URL |
| `OPENAI_API_KEY` | (unset) | OpenAI GPT-4o API key |
| `ANTHROPIC_API_KEY` | (unset) | Anthropic Claude Opus 4.1 API key |
| `GOOGLE_API_KEY` | (unset) | Google Gemini 2.0 Pro API key |
| `DEEPSEEK_API_KEY` | (unset) | DeepSeek R1 API key |

ZAI/GLM-4.6 is auto-available in the sandbox; no key needed.

### Tunable constants (in source)

| Constant | File | Default | Description |
|----------|------|---------|-------------|
| `CYCLE_INTERVAL_MS` | `orchestrator.ts` | 60_000 | Delay between cycles |
| `RIEMANN_EVERY_N_CYCLES` | `orchestrator.ts` | 5 | Run a Riemann attempt every N cycles |
| `ARXIV_EVERY_N_CYCLES` | `orchestrator.ts` | 3 | Scan ArXiv every N cycles |
| `ARCHIVE_EVERY_N_CYCLES` | `orchestrator.ts` | 7 | Regenerate INDEX.md every N cycles |
| `PROMOTION_THRESHOLD` | `proof-verifier.ts` | 0.75 | Confidence required to promote a hypothesis to a theorem |
| `RH_PROMOTION_THRESHOLD` | `riemann-prober.ts` | 0.90 | Confidence required to declare RH proven |

---

## Project Structure

```
zeta-riemannian-agent/
├── README.md                          # this file
├── LICENSE                            # MIT
├── .env.example                       # template for environment variables
├── package.json                       # Next.js + Prisma + socket.io dependencies
├── prisma/
│   └── schema.prisma                  # Hypothesis, ProofAttempt, Theorem, RiemannAttempt, ArxivPaper, KGNode, KGEdge, AgentCycle, OwnerDirective, AgentState
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # root layout (dark theme, metadata)
│   │   ├── page.tsx                   # the 9-tab dashboard
│   │   ├── globals.css
│   │   └── api/
│   │       └── research/
│   │           └── file/
│   │               └── route.ts       # read-only file server for research/*
│   ├── lib/
│   │   ├── db.ts                      # Prisma client
│   │   └── agent/
│   │       ├── types.ts               # shared TypeScript types
│   │       ├── logger.ts              # structured logger with ring buffer
│   │       ├── ajn-backbone.ts        # 14-layer ANN-Psi backbone spec
│   │       ├── llm-router.ts          # multi-LLM task-routed router
│   │       ├── arxiv-adapter.ts       # ArXiv API + caching
│   │       ├── latex-compiler.ts      # tectonic wrapper
│   │       ├── document-archivist.ts  # hierarchical LaTeX storage + templates
│   │       ├── knowledge-graph.ts     # KG nodes + edges + seeding
│   │       ├── hypothesis-generator.ts
│   │       ├── proof-attempter.ts
│   │       ├── proof-verifier.ts
│   │       ├── theorem-archivist.ts
│   │       ├── riemann-prober.ts      # *** the central RH prober + alert ***
│   │       ├── json-utils.ts          # robust JSON extractor for LaTeX-in-JSON
│   │       └── orchestrator.ts        # main autonomous loop
│   └── components/ui/                 # shadcn/ui components
├── mini-services/
│   └── agent-runtime/
│       ├── package.json
│       └── index.ts                   # Socket.io server + agent runtime
├── scripts/
│   └── supervise-agent.sh             # supervisor: restarts the runtime if it dies
├── research/                          # local document archive (hierarchical)
│   ├── hypotheses/
│   ├── proofs/
│   ├── theorems/
│   ├── arxiv-cache/
│   └── riemann-attempts/
├── docs/
│   └── architecture.md                # detailed architecture document
├── Caddyfile                          # gateway config (XTransformPort routing)
└── db/
    └── custom.db                      # SQLite database
```

---

## Lineage & Credits

zRiemannian is the latest in a lineage of autonomous research agents built
on the **Artificial Junky Neuron (AJN)** framework by **Justo Tapiador
Garcia** (Universidad de Alicante):

```
predator-jungle-agent v2.0   (the original AJN framework)
        │
        ▼
fusionary-agent              (nuclear fusion research)
        │
        ▼
quantum-spherifier           (quantum computing research)
        │
        ▼
zeta-riemannian-agent v1.0   (this project — Riemann Hypothesis research)
```

Each descendant inherits the AJN backbone, the multi-LLM router pattern,
the hierarchical document archive, and the autonomous-activation property,
and re-targets them to a new scientific domain. zRiemannian is the first
in the lineage to target **pure mathematics**, and the first to introduce
a **single-conjecture central probe** with a dedicated alert mode.

### Ancestor repositories

- **predator-jungle-agent v2.0**: <https://github.com/Justo-Tapiador/predator-jungle-agent>
- **fusionary-agent**: <https://github.com/Justo-Tapiador/fusionary-agent>
- **quantum-spherifier**: <https://github.com/Justo-Tapiador/quantum-spherifier>

---

## License

MIT © 2026 — zeta-riemannian-agent project. Based on the Agentic Theory
by Justo Tapiador Garcia (Universidad de Alicante).
