// zeta-riemannian-agent v1.0 — Hypothesis Generator
//
// Asks the LLM to propose a new mathematical hypothesis related to the
// Riemann Hypothesis, biased by (a) the current owner focus topic, if any,
// (b) recently cached ArXiv abstracts, and (c) the current knowledge-graph
// activation set.

import { db } from '@/lib/db';
import llmRouter from './llm-router';
import { emit } from './logger';
import type { HypothesisDraft } from './types';
import { writeTex, writeSidecar, hypothesisTex, makeShortCode, rel } from './document-archivist';
import { safeJsonParse } from './json-utils';

let hypothesisSeq = 0;

async function nextSeq(): Promise<number> {
  if (hypothesisSeq === 0) {
    const count = await db.hypothesis.count();
    hypothesisSeq = count + 1;
  } else {
    hypothesisSeq++;
  }
  return hypothesisSeq;
}

const SYSTEM_PROMPT = `You are zRiemannian, a highly creative mathematical research agent
focused on the Riemann Hypothesis. You propose new, well-formed
mathematical hypotheses that are *related* to the Riemann Hypothesis
(either by generalising it, by approaching it from a new angle, or by
providing a tool that could help prove it). Your output MUST be a single
JSON object with the following shape:

{
  "title": "short, precise title",
  "statement": "LaTeX-flavoured statement. Use $...$ for inline math.",
  "motivation": "2-4 sentences explaining why this hypothesis matters for RH.",
  "strategySketch": "2-4 sentences sketching a possible proof strategy.",
  "relatedConcepts": ["kg-node-label-1", "kg-node-label-2"],
  "relatedArxivIds": ["arxiv-id-1"],
  "confidence": 0.0-1.0
}

Be mathematically serious. Avoid restating known results. Prefer
hypotheses that connect two existing concepts in a novel way.`;

export async function generateHypothesis(opts: {
  focusTopic?: string | null;
  recentArxivDigests?: { id: string; title: string; relevance: number }[];
  kgActivations?: { label: string; activation: number }[];
  cycleId?: number;
}): Promise<{ shortCode: string; draft: HypothesisDraft; dbId: string; texPath: string }> {
  const focusLine = opts.focusTopic
    ? `Owner-set focus topic for this cycle: "${opts.focusTopic}". Try to align the hypothesis with this focus when reasonable.`
    : 'No owner focus is set; choose the most promising direction autonomously.';

  const arxivLine = (opts.recentArxivDigests ?? []).slice(0, 5).map(
    (d) => `- arXiv:${d.id} (relevance=${d.relevance.toFixed(2)}) — ${d.title}`
  ).join('\n');

  const kgLine = (opts.kgActivations ?? []).slice(0, 12).map((k) => k.label).join(', ');

  const userPrompt = `Propose ONE new hypothesis related to the Riemann Hypothesis.

${focusLine}

Recently cached ArXiv preprints (use as inspiration, cite when relevant):
${arxivLine || '(none cached yet)'}

Currently active knowledge-graph concepts:
${kgLine || '(none)'}

Return only the JSON object. No prose, no markdown fences.`;

  const res = await llmRouter.call({
    task: 'hypothesis-gen',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.9,
    maxTokens: 1200,
    responseFormat: 'json',
  });

  let draft: HypothesisDraft | null = safeJsonParse<HypothesisDraft>(res.text);
  if (!draft || !draft.title || !draft.statement) {
    emit('error', `hypothesis-gen JSON parse failed`, {
      level: 'warn',
      payload: { raw: res.text.slice(0, 300) },
    });
    // Fall back to a deterministic stub so the cycle does not crash.
    draft = {
      title: 'Fallback hypothesis (LLM JSON unparseable)',
      statement:
        'Let $s=\\sigma+it$. A structural perturbation of $\\xi(s)$ preserving $\\xi(s)=\\xi(1-s)$ lies in the kernel of $\\mathcal{R}=\\partial_s+\\partial_{1-s}$.',
      motivation:
        'Generated as a fallback because the LLM returned unparseable JSON. Replace .env keys or retry to enable creative generation.',
      strategySketch:
        'Linearise $\\xi$ on the critical line; analyse the kernel of $\\mathcal{R}$; show it forces $\\sigma=1/2$.',
      relatedConcepts: ['xi-function', 'critical-line', 'functional-equation'],
      relatedArxivIds: [],
      confidence: 0.15,
    };
  }

  const seq = await nextSeq();
  const shortCode = makeShortCode('H', seq);
  const texSource = hypothesisTex({
    shortCode,
    title: draft.title,
    statement: draft.statement,
    motivation: draft.motivation,
    strategySketch: draft.strategySketch,
    relatedConcepts: draft.relatedConcepts ?? [],
    relatedArxivIds: draft.relatedArxivIds ?? [],
    confidence: draft.confidence ?? 0.5,
  });
  const texAbs = writeTex('hypotheses', `${shortCode}.tex`, texSource);
  writeSidecar('hypotheses', `${shortCode}.meta.json`, {
    shortCode,
    draft,
    model: res.model,
    provider: res.provider,
    cycleId: opts.cycleId ?? null,
    generatedAt: new Date().toISOString(),
  });

  const created = await db.hypothesis.create({
    data: {
      shortCode,
      title: draft.title,
      statement: draft.statement,
      motivation: draft.motivation ?? '',
      strategySketch: draft.strategySketch ?? '',
      relatedConcepts: JSON.stringify(draft.relatedConcepts ?? []),
      relatedArxivIds: JSON.stringify(draft.relatedArxivIds ?? []),
      confidence: draft.confidence ?? 0.5,
      status: 'open',
    },
  });

  emit(
    'hypothesis-proposed',
    `${shortCode} — ${draft.title}`,
    {
      cycleId: opts.cycleId,
      payload: { shortCode, title: draft.title, confidence: draft.confidence },
    }
  );

  return { shortCode, draft, dbId: created.id, texPath: rel(texAbs) };
}

export async function listHypotheses(limit = 50) {
  return db.hypothesis.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    include: { _count: { select: { attempts: true } } },
  });
}

export async function pickOpenHypothesis(): Promise<{ id: string; shortCode: string; title: string; statement: string } | null> {
  // Prefer higher confidence, then most recently created.
  const list = await db.hypothesis.findMany({
    where: { status: { in: ['open', 'attempted'] } },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    take: 5,
  });
  if (list.length === 0) return null;
  // Random pick among top-3 to add diversity.
  const pick = list[Math.floor(Math.random() * Math.min(3, list.length))];
  return {
    id: pick.id,
    shortCode: pick.shortCode,
    title: pick.title,
    statement: pick.statement,
  };
}
