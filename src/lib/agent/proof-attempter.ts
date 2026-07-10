// zeta-riemannian-agent v1.0 — Proof Attempter
//
// Asks the LLM to produce a LaTeX proof attempt of a given hypothesis,
// biased by the available theorem toolkit and the cached ArXiv references.

import { db } from '@/lib/db';
import llmRouter from './llm-router';
import { emit } from './logger';
import type { ProofDraft } from './types';
import { writeTex, writeSidecar, proofTex, makeShortCode, rel, DIRS } from './document-archivist';
import { compileTex } from './latex-compiler';
import { safeJsonParse } from './json-utils';

let proofSeq = 0;

async function nextSeq(): Promise<number> {
  if (proofSeq === 0) {
    const count = await db.proofAttempt.count();
    proofSeq = count + 1;
  } else {
    proofSeq++;
  }
  return proofSeq;
}

const SYSTEM_PROMPT = `You are zRiemannian, an autonomous mathematician. You are attempting
to prove a stated hypothesis related to the Riemann Hypothesis. Output a
single JSON object with EXACTLY this shape:

{
  "approach": "one short phrase, e.g. contradiction / induction / contour integration",
  "strategySummary": "2-3 sentences describing the proof idea.",
  "usesTheoremShortCodes": ["T-YYYY-NNNN", ...],
  "usesArxivIds": ["arxiv-id", ...],
  "texSource": "the BODY of the LaTeX proof, NOT a full document. You may use \\begin{proof}...\\end{proof}, align*, equation, etc. Do NOT include \\documentclass or \\begin{document}."
}

Be mathematically rigorous. If you cannot complete the proof, say so in
the body and identify the gap. Do NOT fabricate references.`;

export async function attemptProof(opts: {
  hypothesis: { id: string; shortCode: string; title: string; statement: string };
  toolkit: { shortCode: string; title: string; statement: string }[];
  arxivRefs: { arxivId: string; title: string }[];
  cycleId?: number;
}): Promise<{
  shortCode: string;
  draft: ProofDraft;
  dbId: string;
  texPath: string;
  pdfPath: string | null;
}> {
  const toolkitLine = opts.toolkit
    .slice(0, 12)
    .map((t) => `- ${t.shortCode}: ${t.title} — ${t.statement.slice(0, 140)}`)
    .join('\n');
  const arxivLine = opts.arxivRefs
    .slice(0, 8)
    .map((a) => `- arXiv:${a.arxivId} — ${a.title}`)
    .join('\n');

  const userPrompt = `Attempt to prove the following hypothesis.

HYPOTHESIS ${opts.hypothesis.shortCode}: ${opts.hypothesis.title}
STATEMENT:
${opts.hypothesis.statement}

AVAILABLE THEOREM TOOLKIT (you may use these as tools):
${toolkitLine || '(no theorems yet — primitive proof)'}

AVAILABLE ARXIV REFERENCES (you may cite these):
${arxivLine || '(none cached)'}

Return only the JSON object. No prose, no markdown fences.`;

  const res = await llmRouter.call({
    task: 'proof-sketch',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxTokens: 3000,
    responseFormat: 'json',
  });

  let draft: ProofDraft | null = safeJsonParse<ProofDraft>(res.text);
  if (!draft || !draft.approach || !draft.texSource) {
    emit('error', `proof-sketch JSON parse failed`, {
      level: 'warn',
      payload: { raw: res.text.slice(0, 300) },
    });
    draft = {
      approach: 'fallback',
      strategySummary: 'Generated as a fallback because the LLM returned unparseable JSON.',
      usesTheoremShortCodes: [],
      usesArxivIds: [],
      texSource:
        '\\begin{proof}\nFallback proof body — the LLM returned unparseable JSON. No mathematical content available in this cycle.\n\\end{proof}',
    };
  }

  const seq = await nextSeq();
  const shortCode = makeShortCode('PA', seq);
  const fullTex = proofTex({
    shortCode,
    hypothesisShortCode: opts.hypothesis.shortCode,
    hypothesisTitle: opts.hypothesis.title,
    approach: draft.approach,
    body: draft.texSource,
    usesTheoremShortCodes: draft.usesTheoremShortCodes ?? [],
    usesArxivIds: draft.usesArxivIds ?? [],
  });

  const texAbs = writeTex('proofs', `${shortCode}.tex`, fullTex);
  // Try to compile to PDF (no-op gracefully if tectonic is absent).
  const compile = await compileTex(fullTex, DIRS.proofs, shortCode);
  const pdfRel = compile.pdfPath ? rel(compile.pdfPath) : null;

  const created = await db.proofAttempt.create({
    data: {
      shortCode,
      hypothesisId: opts.hypothesis.id,
      approach: draft.approach,
      texSource: fullTex,
      texPath: rel(texAbs),
      pdfPath: pdfRel,
      verifierReport: '',
      verdict: 'pending',
      verifierConfidence: 0,
      cycleId: opts.cycleId ?? null,
    },
  });

  // Update hypothesis status to attempted.
  await db.hypothesis.update({
    where: { id: opts.hypothesis.id },
    data: { status: 'attempted' },
  });

  writeSidecar('proofs', `${shortCode}.meta.json`, {
    shortCode,
    hypothesisShortCode: opts.hypothesis.shortCode,
    draft: {
      approach: draft.approach,
      strategySummary: draft.strategySummary,
      usesTheoremShortCodes: draft.usesTheoremShortCodes,
      usesArxivIds: draft.usesArxivIds,
    },
    model: res.model,
    provider: res.provider,
    cycleId: opts.cycleId ?? null,
    compileOk: compile.ok,
    compileLog: compile.log.slice(0, 2000),
    generatedAt: new Date().toISOString(),
  });

  emit(
    'proof-started',
    `${shortCode} attempting ${opts.hypothesis.shortCode} via ${draft.approach}`,
    {
      cycleId: opts.cycleId,
      payload: {
        shortCode,
        hypothesis: opts.hypothesis.shortCode,
        approach: draft.approach,
        compiled: compile.ok,
      },
    }
  );

  return {
    shortCode,
    draft,
    dbId: created.id,
    texPath: rel(texAbs),
    pdfPath: pdfRel,
  };
}
