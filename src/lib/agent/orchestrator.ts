// zeta-riemannian-agent v1.0 — Orchestrator
//
// The main autonomous loop. On startup it immediately begins cycling
// (the AJN "addiction" property — it does NOT wait for an owner request).
// Each cycle picks a phase according to the policy below, executes it
// through the 14-layer backbone, and emits structured events.
//
// Phase policy (per cycle, modulated by owner directives):
//   every 5th cycle  -> riemann-attempt   (the central RH probe)
//   every 3rd cycle  -> arxiv-scan        (refresh the preprint cache)
//   otherwise        -> alternates between hypothesis-gen and proof-attempt,
//                       with an archive pass every 7th cycle.
//
// When the agent is halted (owner directive or RH-proven), the loop
// pauses but the runtime stays alive so the owner can still interact.

import { db } from '@/lib/db';
import llmRouter from './llm-router';
import { emit, log, recentEvents } from './logger';
import {
  BACKBONE_LAYERS,
  initialContext,
  fireLayer,
  backboneSelfCheck,
  type ContextVector,
} from './ajn-backbone';
import { seedKnowledgeGraph, listNodes } from './knowledge-graph';
import {
  searchArxiv,
  cacheArxivHit,
  listCachedPapers,
  pickRhQuery,
  attachSummary,
} from './arxiv-adapter';
import { generateHypothesis, pickOpenHypothesis, listHypotheses } from './hypothesis-generator';
import { attemptProof } from './proof-attempter';
import { verifyProof, PROMOTION_THRESHOLD } from './proof-verifier';
import { promoteToTheorem, toolkitSummary, listTheorems } from './theorem-archivist';
import { attemptRiemannProof, listRiemannAttempts } from './riemann-prober';
import type { AgentEvent, AgentPhase, AgentSnapshot, OwnerDirectivePayload, PriorityLevel } from './types';
import { ensureDirs, writeTex, writeSidecar, hypothesisTex, makeShortCode, rel } from './document-archivist';
import fs from 'fs';
import path from 'path';

const CYCLE_INTERVAL_MS = 60_000; // 1 minute between cycles when no owner is forcing
const RIEMANN_EVERY_N_CYCLES = 5;
const ARXIV_EVERY_N_CYCLES = 3;
const ARCHIVE_EVERY_N_CYCLES = 7;

// ============================================================================
// PATCH: Known directive kinds.
// ----------------------------------------------------------------------------
// Exposed via isKnownDirectiveKind() so the web server can reject unknown
// kinds at the WS layer BEFORE the orchestrator's switch statement silently
// drops them. This is the difference between "the user sees a green toast
// that lies" and "the user sees a red toast that tells them the truth".
// ============================================================================
const KNOWN_DIRECTIVE_KINDS = new Set<OwnerDirectivePayload['kind']>([
  'set-focus',
  'halt',
  'resume',
  'force-riemann-attempt',
  'inject-hypothesis',
  'rerun-cycle',
  'force-phase',
  'priority',
  'shutdown',
]);

export type EventListener = (ev: AgentEvent) => void;

class Orchestrator {
  private listeners = new Set<EventListener>();
  private timer: NodeJS.Timeout | null = null;
  private startedAt = Date.now();
  private currentCycleId = 0;
  private currentPhase: AgentPhase = 'idle';
  private isHalted = false;
  private riemannProven = false;
  private focusTopic: string | null = null;
  private ownerDirectiveQueue: OwnerDirectivePayload[] = [];
  private cycling = false;

  // Owner overrides (set by directives, consumed by pickPhase / runCycle).
  private forcedPhase: AgentPhase | null = null; // set by `force-phase`
  private forcedPhaseTtl = 0; // cycles remaining for forcedPhase (0 = clear after next cycle)
  private priorityLevel: PriorityLevel = 'normal'; // set by `priority`
  private cycleIntervalOverride: number | null = null; // derived from priority

  async start() {
    ensureDirs();
    await llmRouter.init();
    backboneSelfCheck();
    await this.ensureAgentState();
    await seedKnowledgeGraph();
    this.hookLogger();
    log.info('zRiemannian orchestrator starting — AJN addiction engaged');
    emit('log', 'zRiemannian launched — autonomous research begins NOW', {
      level: 'info',
    });
    // Fire the first cycle immediately (AJN addiction — no waiting).
    this.scheduleCycle(0);
  }

  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info('zRiemannian orchestrator stopped');
  }

  addListener(l: EventListener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private hookLogger() {
    // The logger.emit function already pushes to a ring; subscribers poll it
    // via the WebSocket mini-service. Nothing to do here.
  }

  private async ensureAgentState() {
    const existing = await db.agentState.findUnique({ where: { id: 1 } });
    if (!existing) {
      await db.agentState.create({ data: { id: 1, isRunning: true, isHalted: false } });
    } else {
      this.isHalted = existing.isHalted;
      this.riemannProven = existing.riemannProven;
      this.focusTopic = existing.focusTopic;
    }

    // ========================================================================
    // PATCH: Recover directives that were queued but not yet applied when
    // the process was last shut down.
    // ------------------------------------------------------------------------
    // Without this, an in-flight `resume` directive (the most common one to
    // be queued right before a halt-restart) would be lost forever on the
    // next process restart — the in-memory queue is wiped, and the DB row
    // stays in `queued` status indefinitely.
    // ============================================================================
    try {
      const pending = await db.ownerDirective.findMany({
        where: { status: 'queued' },
        orderBy: { id: 'asc' },
      });
      for (const d of pending) {
        try {
          const payload = JSON.parse(d.payload) as OwnerDirectivePayload;
          this.ownerDirectiveQueue.push(payload);
        } catch {
          // Skip malformed entries — mark them as rejected so they don't
          // block recovery on the next restart.
          await db.ownerDirective
            .update({
              where: { id: d.id },
              data: { status: 'rejected', note: 'malformed payload on recovery' },
            })
            .catch(() => {});
        }
      }
      if (pending.length > 0) {
        log.info(`recovered ${pending.length} pending directive(s) from DB`);
      }
    } catch (e: any) {
      // best-effort: don't fail start() just because recovery failed.
      (log.error ?? log.info)?.(`failed to recover pending directives: ${e?.message ?? e}`);
    }
  }

  // ============================================================================
  // PATCH: Public validator so the web server can reject unknown directive
  // kinds before they enter the queue.
  // ============================================================================
  isKnownDirectiveKind(kind: string): boolean {
    return KNOWN_DIRECTIVE_KINDS.has(kind as OwnerDirectivePayload['kind']);
  }

  private scheduleCycle(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    // Priority overrides the requested delay if it's shorter.
    const effectiveDelay = Math.min(delayMs, this.effectiveCycleInterval());
    this.timer = setTimeout(() => {
      this.runCycle().catch((e) => {
        emit('error', `cycle crashed: ${e?.message ?? e}`, { level: 'error' });
        this.scheduleCycle(CYCLE_INTERVAL_MS);
      });
    }, effectiveDelay);
  }

  /**
   * Effective cycle interval based on the current priority level.
   * 'critical' overrides everything to a 1s tick so the owner gets
   * near-real-time feedback during a forced run.
   * 'high' = 5s, 'normal' = 60s (default), 'low' = 300s (throttle).
   */
  private effectiveCycleInterval(): number {
    if (this.cycleIntervalOverride !== null) return this.cycleIntervalOverride;
    switch (this.priorityLevel) {
      case 'critical': return 1_000;
      case 'high':     return 5_000;
      case 'low':      return 300_000;
      case 'normal':
      default:         return CYCLE_INTERVAL_MS;
    }
  }

  private async runCycle() {
    // ========================================================================
    // PATCH (CRITICAL): Process queued owner directives FIRST, even if the
    // agent is currently halted or in riemann-proven mode.
    // ------------------------------------------------------------------------
    // The previous implementation called applyQueuedDirectives() AFTER the
    // `if (this.isHalted)` early-return. That created a chicken-and-egg
    // deadlock: the 'resume' directive (which clears isHalted) could never
    // be applied because every cycle exited early when isHalted was true.
    // The user-visible symptom was the Halt/Resume toggle getting stuck on
    // "Resume" (green) forever, with logs repeating
    //   `agent is halted by owner — skipping cycle`
    // indefinitely — even across process restarts, because ensureAgentState
    // reloads isHalted=true from the DB on every boot.
    //
    // Moving this call ABOVE the halt check is the actual fix for that bug.
    // ============================================================================
    await this.applyQueuedDirectives();

    if (this.riemannProven) {
      // RH-proven mode: keep broadcasting the alert, do nothing else.
      emit(
        'riemann-proven',
        '*** RIEMANN HYPOTHESIS HAS BEEN PROVEN — agent is in alert-only mode ***',
        { level: 'critical' }
      );
      this.scheduleCycle(15_000); // re-broadcast every 15s
      return;
    }
    if (this.isHalted) {
      emit('log', 'agent is halted by owner — skipping cycle', { level: 'info' });
      this.scheduleCycle(CYCLE_INTERVAL_MS);
      return;
    }

    this.currentCycleId++;
    const cycleId = this.currentCycleId;
    const phase = this.pickPhase(cycleId);
    this.currentPhase = phase;

    // Reset the per-cycle LLM accounting so the stats we persist at the end
    // reflect only this cycle's calls.
    llmRouter.resetCycleStats();

    const cycle = await db.agentCycle.create({
      data: { startedAt: new Date(), phase, status: 'running' },
    });
    await db.agentState.update({
      where: { id: 1 },
      data: { currentCycleId: cycle.id, totalCycles: { increment: 1 } },
    });

    emit('cycle-start', `cycle #${cycleId} phase=${phase}`, {
      cycleId,
      phase,
      payload: { cycleId, phase },
    });
    emit('phase-change', `phase -> ${phase}`, { cycleId, phase });

    const ctx = initialContext(cycleId, phase);

    try {
      // Always fire layers 1-2 (sensory intake).
      await fireLayer(ctx, BACKBONE_LAYERS[0]);
      await fireLayer(ctx, BACKBONE_LAYERS[1]);

      // Populate context with KG activations + recent ArXiv digests.
      const kgNodes = await listNodes(20);
      ctx.kgActivations = kgNodes.map((n) => ({ label: n.label, activation: 1 }));
      const cached = await listCachedPapers(8);
      ctx.arxivDigests = cached.map((p) => ({
        id: p.arxivId,
        title: p.title,
        relevance: p.relevanceScore,
      }));
      await fireLayer(ctx, BACKBONE_LAYERS[2]); // Pattern-8

      switch (phase) {
        case 'arxiv-scan':
          await this.phaseArxivScan(ctx);
          break;
        case 'hypothesis-gen':
          await this.phaseHypothesisGen(ctx);
          break;
        case 'proof-attempt':
          await this.phaseProofAttempt(ctx);
          break;
        case 'riemann-attempt':
          await this.phaseRiemannAttempt(ctx);
          break;
        case 'archive':
          await this.phaseArchive(ctx);
          break;
        case 'idle':
        default:
          emit('log', 'idle phase — no-op', { cycleId, phase });
          break;
      }

      // Fire the rest of the backbone symbolically (layers 4-14) to mirror
      // the predator-jungle-agent convention.
      for (let i = 3; i < BACKBONE_LAYERS.length; i++) {
        await fireLayer(ctx, BACKBONE_LAYERS[i]);
      }

      // Persist the LLM stats accumulated during this cycle.
      const stats = llmRouter.cycleStats();
      await db.agentCycle.update({
        where: { id: cycle.id },
        data: {
          endedAt: new Date(),
          status: 'ok',
          llmCalls: stats.calls,
          llmTokensIn: stats.tokensIn,
          llmTokensOut: stats.tokensOut,
          llmProvider: stats.provider,
          llmModel: stats.model,
        },
      });
      emit('cycle-end', `cycle #${cycleId} ok (provider=${stats.provider ?? 'none'}, model=${stats.model ?? 'none'})`, {
        cycleId,
        phase,
        payload: {
          llmCalls: stats.calls,
          llmProvider: stats.provider,
          llmModel: stats.model,
          tokensIn: stats.tokensIn,
          tokensOut: stats.tokensOut,
        },
      });
    } catch (e: any) {
      // Even on error, persist whatever LLM stats we managed to collect
      // before the crash — useful for debugging which provider was in use.
      const stats = llmRouter.cycleStats();
      await db.agentCycle.update({
        where: { id: cycle.id },
        data: {
          endedAt: new Date(),
          status: 'error',
          error: e?.message ?? String(e),
          llmCalls: stats.calls,
          llmTokensIn: stats.tokensIn,
          llmTokensOut: stats.tokensOut,
          llmProvider: stats.provider,
          llmModel: stats.model,
        },
      });
      emit('error', `cycle #${cycleId} failed: ${e?.message ?? e}`, {
        cycleId,
        phase,
        level: 'error',
      });
    }

    this.currentPhase = 'idle';
    this.scheduleCycle(CYCLE_INTERVAL_MS);
  }

  private pickPhase(cycleId: number): AgentPhase {
    // Owner-requested phase override (set by `force-phase` directive).
    // Takes precedence over the standard cadence. TTL counts down each cycle.
    if (this.forcedPhase) {
      const phase = this.forcedPhase;
      if (this.forcedPhaseTtl > 0) {
        this.forcedPhaseTtl--;
        if (this.forcedPhaseTtl === 0) {
          this.forcedPhase = null;
        }
      }
      emit('log', `phase override active: ${phase} (ttl remaining after this cycle: ${this.forcedPhaseTtl})`, {
        cycleId,
        payload: { forcedPhase: phase, ttl: this.forcedPhaseTtl },
      });
      return phase;
    }
    if (cycleId % RIEMANN_EVERY_N_CYCLES === 0) return 'riemann-attempt';
    if (cycleId % ARXIV_EVERY_N_CYCLES === 0) return 'arxiv-scan';
    if (cycleId % ARCHIVE_EVERY_N_CYCLES === 0) return 'archive';
    return cycleId % 2 === 0 ? 'hypothesis-gen' : 'proof-attempt';
  }

  // ----- Phases -----

  private async phaseArxivScan(ctx: ContextVector) {
    const query = this.focusTopic ?? pickRhQuery();
    const hits = await searchArxiv(query, { max: 5, sortBy: 'relevance' });
    emit('arxiv-fetched', `ArXiv scan returned ${hits.length} hits for "${query}"`, {
      cycleId: ctx.cycleId,
      phase: ctx.phase,
      payload: { query, count: hits.length },
    });
    for (const hit of hits) {
      // Compute a simple relevance score: 0.5 baseline, +0.3 if title mentions
      // 'Riemann' or 'zeta', +0.2 if abstract mentions 'critical line'.
      const title = hit.title.toLowerCase();
      const abs = hit.abstract.toLowerCase();
      let rel = 0.5;
      if (title.includes('riemann') || title.includes('zeta')) rel += 0.3;
      if (abs.includes('critical line') || abs.includes('re(s) = 1/2')) rel += 0.2;
      rel = Math.min(1, rel);
      const cached = await cacheArxivHit(hit, rel);
      // Optionally attach a summary via the LLM.
      try {
        const sumRes = await llmRouter.call({
          task: 'arxiv-summarise',
          systemPrompt:
            'You are zRiemannian. Summarise the given ArXiv abstract in 2-3 sentences, emphasising its relevance to the Riemann Hypothesis.',
          userPrompt: `Title: ${hit.title}\nAbstract: ${hit.abstract}`,
          temperature: 0.3,
          maxTokens: 300,
        });
        await attachSummary(cached.arxivId, sumRes.text, rel);
      } catch (e: any) {
        emit('error', `arxiv summarise failed for ${hit.arxivId}: ${e.message}`, {
          level: 'warn',
        });
      }
      await db.agentState.update({
        where: { id: 1 },
        data: { totalArxivPapers: { increment: 1 } },
      });
    }
  }

  private async phaseHypothesisGen(ctx: ContextVector) {
    const { shortCode, dbId } = await generateHypothesis({
      focusTopic: this.focusTopic,
      recentArxivDigests: ctx.arxivDigests,
      kgActivations: ctx.kgActivations,
      cycleId: ctx.cycleId,
    });
    await db.agentState.update({
      where: { id: 1 },
      data: { totalHypotheses: { increment: 1 } },
    });
    void shortCode;
    void dbId;
  }

  private async phaseProofAttempt(ctx: ContextVector) {
    const target = await pickOpenHypothesis();
    if (!target) {
      emit('log', 'no open hypothesis to prove — generating one first', {
        cycleId: ctx.cycleId,
        phase: ctx.phase,
      });
      await this.phaseHypothesisGen(ctx);
      return;
    }
    const toolkit = await toolkitSummary(12);
    const arxivRefs = (await listCachedPapers(8)).map((p) => ({
      arxivId: p.arxivId,
      title: p.title,
    }));
    const { dbId } = await attemptProof({
      hypothesis: target,
      toolkit,
      arxivRefs,
      cycleId: ctx.cycleId,
    });
    // Verify the proof.
    const attempt = await db.proofAttempt.findUnique({
      where: { id: dbId },
      include: { hypothesis: true },
    });
    if (!attempt) return;
    const report = await verifyProof({
      proofAttemptId: attempt.id,
      shortCode: attempt.shortCode,
      hypothesisShortCode: attempt.hypothesis.shortCode,
      hypothesisStatement: attempt.hypothesis.statement,
      proofBody: attempt.texSource,
      cycleId: ctx.cycleId,
    });
    if (report.verdict === 'valid' && report.confidence >= PROMOTION_THRESHOLD) {
      await promoteToTheorem({
        hypothesisId: attempt.hypothesisId,
        proofAttemptId: attempt.id,
        cycleId: ctx.cycleId,
      });
      await db.agentState.update({
        where: { id: 1 },
        data: { totalTheorems: { increment: 1 } },
      });
    }
  }

  private async phaseRiemannAttempt(ctx: ContextVector) {
    const toolkit = await toolkitSummary(16);
    const arxivRefs = (await listCachedPapers(10)).map((p) => ({
      arxivId: p.arxivId,
      title: p.title,
    }));
    const { proven } = await attemptRiemannProof({
      toolkit,
      arxivRefs,
      cycleId: ctx.cycleId,
    });
    if (proven) {
      this.riemannProven = true;
      this.isHalted = true;
    }
  }

  private async phaseArchive(ctx: ContextVector) {
    // Regenerate INDEX.md with the current state of research/.
    const root = path.join(process.cwd(), 'research');
    const indexPath = path.join(root, 'INDEX.md');
    const hyps = await listHypotheses(50);
    const thms = await listTheorems(50);
    const rhs = await listRiemannAttempts(50);
    const arxiv = await listCachedPapers(50);

    const lines: string[] = [];
    lines.push('# zRiemannian research archive — INDEX\n');
    lines.push(`Auto-regenerated by the archive phase at ${new Date().toISOString()}.\n`);
    lines.push('\n## Hypotheses\n');
    for (const h of hyps) {
      lines.push(`- **${h.shortCode}** (${h.status}, conf=${h.confidence.toFixed(2)}): ${h.title}`);
    }
    lines.push('\n## Theorems\n');
    for (const t of thms) {
      lines.push(`- **${t.shortCode}**: ${t.title}`);
    }
    lines.push('\n## Riemann attempts\n');
    for (const r of rhs) {
      lines.push(
        `- **${r.shortCode}** (${r.verdict}, conf=${r.verifierConfidence.toFixed(2)}): ${r.strategy}`
      );
    }
    lines.push('\n## ArXiv cache\n');
    for (const a of arxiv) {
      lines.push(`- arXiv:${a.arxivId} (rel=${a.relevanceScore.toFixed(2)}): ${a.title}`);
    }
    fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
    emit('doc-written', `regenerated ${path.relative(process.cwd(), indexPath)}`, {
      cycleId: ctx.cycleId,
      phase: ctx.phase,
    });
  }

  // ----- Owner directives -----

  enqueueDirective(d: OwnerDirectivePayload) {
    this.ownerDirectiveQueue.push(d);
    emit('log', `owner directive queued: ${d.kind}`, { payload: { ...d } as Record<string, unknown> });
    // Persist immediately so the queue survives a process restart.
    // Status starts as 'queued'; it transitions to 'applied' or 'rejected'
    // when applyDirective() finishes.
    db.ownerDirective
      .create({
        data: {
          kind: d.kind,
          payload: JSON.stringify(d),
          status: 'queued',
        },
      })
      .catch((e: any) => {
        emit('error', `failed to persist directive ${d.kind}: ${e?.message ?? e}`, {
          level: 'warn',
        });
      });

    // ========================================================================
    // PATCH (CRITICAL): Trigger immediate processing of the queue.
    // ------------------------------------------------------------------------
    // Without this, halt/resume directives would only take effect on the
    // next scheduled cycle (up to 60s away at normal priority, or 300s at
    // low priority). Worse, when the agent is halted the next cycle never
    // reaches applyQueuedDirectives() at all (the original bug) — so the
    // `resume` directive would sit in the queue forever. setImmediate
    // ensures the queue is drained on the next tick of the event loop
    // regardless of the cycle timer state.
    //
    // applyQueuedDirectives() is idempotent (it drains the queue with shift()
    // and is safe to call concurrently — JS is single-threaded so there's no
    // race), so calling it from multiple sites is fine.
    // ============================================================================
    setImmediate(() => {
      this.applyQueuedDirectives().catch((e: any) => {
        emit('error', `failed to apply directive ${d.kind}: ${e?.message ?? e}`, {
          level: 'error',
        });
      });
    });
  }

  private async applyQueuedDirectives() {
    while (this.ownerDirectiveQueue.length > 0) {
      const d = this.ownerDirectiveQueue.shift()!;
      await this.applyDirective(d);
    }
  }

  private async applyDirective(d: OwnerDirectivePayload) {
    const VALID_PHASES: AgentPhase[] = [
      'arxiv-scan',
      'hypothesis-gen',
      'proof-attempt',
      'riemann-attempt',
      'archive',
      'idle',
    ];
    const VALID_PRIORITIES: PriorityLevel[] = ['low', 'normal', 'high', 'critical'];

    try {
      switch (d.kind) {
        case 'set-focus':
          this.focusTopic = d.focus ?? null;
          await db.agentState.update({
            where: { id: 1 },
            data: { focusTopic: this.focusTopic },
          });
          emit('owner-directive-applied', `focus set to "${this.focusTopic}"`, {
            payload: { kind: d.kind, focus: this.focusTopic },
          });
          break;

        case 'halt':
          this.isHalted = true;
          await db.agentState.update({ where: { id: 1 }, data: { isHalted: true } });
          emit('owner-directive-applied', 'agent HALTED by owner', { payload: { kind: d.kind } });
          break;

        case 'resume':
          this.isHalted = false;
          await db.agentState.update({ where: { id: 1 }, data: { isHalted: false } });
          emit('owner-directive-applied', 'agent RESUMED by owner', { payload: { kind: d.kind } });
          // Kick the cycle timer so the agent resumes immediately instead of
          // waiting up to CYCLE_INTERVAL_MS for the next scheduled tick.
          this.scheduleCycle(0);
          break;

        case 'force-riemann-attempt':
          emit('owner-directive-applied', 'owner forcing a Riemann attempt', {
            payload: { kind: d.kind },
          });
          // Run the Riemann attempt synchronously outside the normal cycle.
          {
            const ctx = initialContext(this.currentCycleId + 1, 'riemann-attempt');
            await this.phaseRiemannAttempt(ctx);
          }
          break;

        case 'inject-hypothesis':
          if (d.hypothesisDraft) {
            // Persist directly without LLM generation.
            const seq = (await db.hypothesis.count()) + 1;
            const shortCode = makeShortCode('H', seq);
            const tex = hypothesisTex({
              shortCode,
              title: d.hypothesisDraft.title,
              statement: d.hypothesisDraft.statement,
              motivation: d.hypothesisDraft.motivation,
              strategySketch: d.hypothesisDraft.strategySketch,
              relatedConcepts: d.hypothesisDraft.relatedConcepts,
              relatedArxivIds: d.hypothesisDraft.relatedArxivIds,
              confidence: d.hypothesisDraft.confidence,
            });
            const texAbs = writeTex('hypotheses', `${shortCode}.tex`, tex);
            writeSidecar('hypotheses', `${shortCode}.meta.json`, {
              shortCode,
              draft: d.hypothesisDraft,
              injectedByOwner: true,
              generatedAt: new Date().toISOString(),
            });
            await db.hypothesis.create({
              data: {
                shortCode,
                title: d.hypothesisDraft.title,
                statement: d.hypothesisDraft.statement,
                motivation: d.hypothesisDraft.motivation,
                strategySketch: d.hypothesisDraft.strategySketch,
                relatedConcepts: JSON.stringify(d.hypothesisDraft.relatedConcepts),
                relatedArxivIds: JSON.stringify(d.hypothesisDraft.relatedArxivIds),
                confidence: d.hypothesisDraft.confidence,
                status: 'open',
              },
            });
            await db.agentState.update({
              where: { id: 1 },
              data: { totalHypotheses: { increment: 1 } },
            });
            emit('owner-directive-applied', `injected hypothesis ${shortCode}`, {
              payload: { kind: d.kind, shortCode, texPath: rel(texAbs) },
            });
          } else {
            emit('owner-directive-rejected', 'inject-hypothesis requires hypothesisDraft', {
              payload: { kind: d.kind },
            });
          }
          break;

        case 'rerun-cycle':
          // Force the next cycle to run immediately, regardless of the
          // current cycle interval. We do this by clearing the pending
          // timer and rescheduling with delay 0.
          emit('owner-directive-applied', 'owner forcing immediate cycle rerun', {
            payload: { kind: d.kind },
          });
          // If the agent is halted, we still allow this so the owner can
          // trigger a one-shot cycle without resuming the autonomous loop.
          this.scheduleCycle(0);
          break;

        case 'force-phase': {
          // Force the next N cycles to use a specific phase. Default TTL = 1
          // (just the next cycle). ttl=0 clears any active override.
          if (!d.phase || !VALID_PHASES.includes(d.phase)) {
            emit('owner-directive-rejected', `force-phase requires valid phase (got "${d.phase}")`, {
              payload: { kind: d.kind, phase: d.phase, valid: VALID_PHASES },
            });
            break;
          }
          if (d.ttl === 0) {
            this.forcedPhase = null;
            this.forcedPhaseTtl = 0;
            emit('owner-directive-applied', `phase override cleared`, {
              payload: { kind: d.kind },
            });
          } else {
            const ttl = Math.max(1, Math.min(20, d.ttl ?? 1)); // clamp 1..20
            this.forcedPhase = d.phase;
            this.forcedPhaseTtl = ttl;
            emit('owner-directive-applied', `phase forced to "${d.phase}" for ${ttl} cycle(s)`, {
              payload: { kind: d.kind, phase: d.phase, ttl },
            });
          }
          break;
        }

        case 'priority': {
          // Set the agent's priority level, which controls the cycle interval.
          // 'critical' = 1s, 'high' = 5s, 'normal' = 60s, 'low' = 300s.
          const level = d.priority ?? 'normal';
          if (!VALID_PRIORITIES.includes(level)) {
            emit('owner-directive-rejected', `priority requires valid level (got "${level}")`, {
              payload: { kind: d.kind, priority: level, valid: VALID_PRIORITIES },
            });
            break;
          }
          this.priorityLevel = level;
          this.cycleIntervalOverride = null; // reset any explicit override
          emit('owner-directive-applied', `priority set to "${level}"`, {
            payload: { kind: d.kind, priority: level },
          });
          // Reschedule the next cycle with the new interval (only if running).
          if (this.timer && !this.isHalted && !this.riemannProven) {
            this.scheduleCycle(this.effectiveCycleInterval());
          }
          break;
        }

        case 'shutdown':
          await this.stop();
          emit('owner-directive-applied', 'agent SHUTDOWN by owner', { payload: { kind: d.kind } });
          break;

        default:
          emit('owner-directive-rejected', `unknown directive kind: ${d.kind}`, {
            payload: { kind: d.kind },
          });
      }

      // Mark the directive as applied in the DB (best-effort).
      await db.ownerDirective.updateMany({
        where: { kind: d.kind, status: 'queued' },
        data: { status: 'applied', appliedAt: new Date() },
      }).catch(() => { /* best-effort */ });
    } catch (e: any) {
      emit('owner-directive-rejected', `directive ${d.kind} threw: ${e?.message ?? e}`, {
        payload: { kind: d.kind, error: e?.message ?? String(e) },
        level: 'error',
      });
      await db.ownerDirective.updateMany({
        where: { kind: d.kind, status: 'queued' },
        data: { status: 'rejected', appliedAt: new Date(), note: e?.message ?? String(e) },
      }).catch(() => { /* best-effort */ });
    }
  }

  async snapshot(): Promise<AgentSnapshot> {
    const state = await db.agentState.findUnique({ where: { id: 1 } });
    const cycles = await db.agentCycle.count();
    const hyps = await db.hypothesis.count();
    const thms = await db.theorem.count();
    const arxiv = await db.arxivPaper.count();
    const rh = await db.riemannAttempt.count();
    const last = (recentEvents(1) as AgentEvent[])[0] ?? null;
    return {
      isRunning: !!this.timer,
      isHalted: this.isHalted,
      riemannProven: this.riemannProven,
      riemannProvenAt: state?.riemannProvenAt?.toISOString() ?? null,
      currentCycleId: this.currentCycleId || state?.currentCycleId || null,
      currentPhase: this.currentPhase,
      forcedPhase: this.forcedPhase,
      priorityLevel: this.priorityLevel,
      totalCycles: cycles,
      totalHypotheses: hyps,
      totalTheorems: thms,
      totalArxivPapers: arxiv,
      totalRiemannAttempts: rh,
      focusTopic: this.focusTopic,
      lastEvent: last,
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  /**
   * Recent cycle history with LLM provider/model info. Used by the dashboard
   * to show which provider served each cycle.
   */
  async listRecentCycles(limit = 25): Promise<Array<{
    id: number;
    startedAt: Date;
    endedAt: Date | null;
    phase: string;
    status: string;
    llmCalls: number;
    llmProvider: string | null;
    llmModel: string | null;
    llmTokensIn: number;
    llmTokensOut: number;
    error: string | null;
  }>> {
    const rows = await db.agentCycle.findMany({
      orderBy: [{ id: 'desc' }],
      take: limit,
    });
    return rows.map((c) => ({
      id: c.id,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      phase: c.phase,
      status: c.status,
      llmCalls: c.llmCalls,
      llmProvider: c.llmProvider,
      llmModel: c.llmModel,
      llmTokensIn: c.llmTokensIn,
      llmTokensOut: c.llmTokensOut,
      error: c.error,
    }));
  }
}

const orchestrator = new Orchestrator();
export default orchestrator;
