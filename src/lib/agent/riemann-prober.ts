// zeta-riemannian-agent v1.0 — Central Riemann Prober
//
// Periodically attempts to prove the Riemann Hypothesis itself. Each attempt
// is independently verified by an ADVERSARIAL pass with a much higher
// confidence threshold (RH_PROMOTION_THRESHOLD). If an attempt is judged
// valid above the threshold, the agent enters RIEMANN-PROVEN MODE:
//   - All hypothesis creation stops.
//   - All proof attempts stop.
//   - A critical alert is broadcast on the WebSocket.
//   - The LaTeX proof is written to research/riemann-attempts/<shortCode>.tex
//     AND a PDF is compiled.
//   - The AgentState.riemannProven flag is set.
//   - The agent keeps broadcasting the alert periodically until the owner
//     acknowledges or shuts it down.

import { db } from '@/lib/db';
import llmRouter from './llm-router';
import { emit } from './logger';
import { writeTex, writeSidecar, riemannAttemptTex, makeShortCode, rel, DIRS } from './document-archivist';
import { compileTex } from './latex-compiler';
import { safeJsonParse } from './json-utils';

export const RH_PROMOTION_THRESHOLD = 0.9;

let rhSeq = 0;

async function nextSeq(): Promise<number> {
  if (rhSeq === 0) {
    const count = await db.riemannAttempt.count();
    rhSeq = count + 1;
  } else {
    rhSeq++;
  }
  return rhSeq;
}

const RIEMANN_STATEMENT = `Riemann Hypothesis (RH). All non-trivial zeros of the Riemann zeta
function $\\zeta(s)$ lie on the critical line $\\Re(s) = 1/2$. Equivalently,
the completed function $\\xi(s) = \\tfrac12 s(s-1)\\pi^{-s/2}\\Gamma(s/2)\\zeta(s)$
has all of its zeros on $\\Re(s) = 1/2$.`;

const SYSTEM_PROMPT = `You are zRiemannian attempting a FULL proof of the Riemann Hypothesis.
Output a single JSON object with EXACTLY this shape:

{
  "strategy": "one short phrase naming the proof strategy",
  "usesTheoremShortCodes": ["T-YYYY-NNNN", ...],
  "usesArxivIds": ["arxiv-id", ...],
  "texSource": "the BODY of the LaTeX proof (no \\documentclass, no \\begin{document}). You may use proof environments, align*, etc."
}

Be honest. If the proof is incomplete, say so explicitly inside the body.
Do NOT fabricate theorems or references.`;

const STRATEGIES = [
  'Weil explicit formula with a positive-definite test function',
  'Hilbert–Pólya operator via a self-adjoint extension',
  'Selberg-class equality of degree-1 L-functions',
  'Li coefficient asymptotics via Newton identities',
  'Random-matrix local statistics bootstrap',
  'Converse theorem for SL(2) automorphic L-functions',
  'Spectral interpretation of the xi operator',
  'Modular-forms approach via Eisenstein series',
  'Positive measure on the critical line via Jensen',
  'p-adic interpolation and recombination',
];

export async function attemptRiemannProof(opts: {
  toolkit: { shortCode: string; title: string; statement: string }[];
  arxivRefs: { arxivId: string; title: string }[];
  cycleId?: number;
}): Promise<{ shortCode: string; proven: boolean; verdict: string; confidence: number }> {
  const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];

  const toolkitLine = opts.toolkit
    .slice(0, 16)
    .map((t) => `- ${t.shortCode}: ${t.title} — ${t.statement.slice(0, 160)}`)
    .join('\n');
  const arxivLine = opts.arxivRefs
    .slice(0, 10)
    .map((a) => `- arXiv:${a.arxivId} — ${a.title}`)
    .join('\n');

  const userPrompt = `Attempt a FULL proof of the Riemann Hypothesis.

STATEMENT:
${RIEMANN_STATEMENT}

STRATEGY FOR THIS ATTEMPT: ${strategy}

AVAILABLE THEOREM TOOLKIT (you may use these as tools):
${toolkitLine || '(no theorems yet — primitive proof)'}

AVAILABLE ARXIV REFERENCES (you may cite these):
${arxivLine || '(none cached)'}

Return only the JSON object.`;

  const res = await llmRouter.call({
    task: 'riemann-attempt',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 4000,
    responseFormat: 'json',
  });

  let draft: { strategy: string; usesTheoremShortCodes: string[]; usesArxivIds: string[]; texSource: string } | null =
    safeJsonParse<{ strategy: string; usesTheoremShortCodes: string[]; usesArxivIds: string[]; texSource: string }>(res.text);
  if (!draft || !draft.texSource) {
    emit('error', `riemann-attempt JSON parse failed`, { level: 'warn' });
    draft = {
      strategy,
      usesTheoremShortCodes: [],
      usesArxivIds: [],
      texSource:
        '\\begin{proof}\nFallback Riemann proof body — the LLM returned unparseable JSON.\n\\end{proof}',
    };
  }

  const seq = await nextSeq();
  const shortCode = makeShortCode('RH', seq);

  emit(
    'riemann-attempt-started',
    `${shortCode} — strategy: ${strategy}`,
    { cycleId: opts.cycleId, level: 'info', payload: { shortCode, strategy } }
  );

  const fullTex = riemannAttemptTex({
    shortCode,
    strategy: draft.strategy || strategy,
    body: draft.texSource,
    usesTheoremShortCodes: draft.usesTheoremShortCodes ?? [],
    usesArxivIds: draft.usesArxivIds ?? [],
  });

  const texAbs = writeTex('riemann-attempts', `${shortCode}.tex`, fullTex);
  const compile = await compileTex(fullTex, DIRS.riemann, shortCode);
  const pdfRel = compile.pdfPath ? rel(compile.pdfPath) : null;

  // Adversarial verification with a stricter prompt.
  const report = await verifyRiemannProof({
    shortCode,
    proofBody: draft.texSource,
    cycleId: opts.cycleId,
  });

  const created = await db.riemannAttempt.create({
    data: {
      shortCode,
      strategy: draft.strategy || strategy,
      texSource: fullTex,
      texPath: rel(texAbs),
      pdfPath: pdfRel,
      verifierReport: JSON.stringify(report, null, 2),
      verdict: report.verdict,
      verifierConfidence: report.confidence,
      cycleId: opts.cycleId ?? null,
    },
  });

  writeSidecar('riemann-attempts', `${shortCode}.verifier.json`, {
    shortCode,
    report,
    model: res.model,
    provider: res.provider,
    cycleId: opts.cycleId ?? null,
    verifiedAt: new Date().toISOString(),
  });

  const proven = report.verdict === 'valid' && report.confidence >= RH_PROMOTION_THRESHOLD;

  emit(
    proven ? 'riemann-proven' : 'riemann-attempt-finished',
    proven
      ? `*** RIEMANN HYPOTHESIS PROVEN *** ${shortCode} conf=${report.confidence.toFixed(2)}`
      : `${shortCode} verdict=${report.verdict} conf=${report.confidence.toFixed(2)}`,
    {
      cycleId: opts.cycleId,
      level: proven ? 'critical' : 'info',
      payload: {
        shortCode,
        verdict: report.verdict,
        confidence: report.confidence,
        strategy: draft.strategy || strategy,
        compiled: compile.ok,
        dbId: created.id,
      },
    }
  );

  if (proven) {
    // Set the global flag.
    await db.agentState.upsert({
      where: { id: 1 },
      update: {
        riemannProven: true,
        riemannProvenAt: new Date(),
        riemannProvenAttemptId: created.id,
        isHalted: true, // halt the autonomous loop
      },
      create: {
        id: 1,
        riemannProven: true,
        riemannProvenAt: new Date(),
        riemannProvenAttemptId: created.id,
        isHalted: true,
      },
    });
  }

  return {
    shortCode,
    proven,
    verdict: report.verdict,
    confidence: report.confidence,
  };
}

const RIEMANN_VERIFY_SYSTEM = `You are zRiemannian's HIGHEST-STAKES proof verifier. The submitted
proof claims to prove the Riemann Hypothesis. Apply maximal skepticism.
Check every step. If the proof relies on an unproven conjecture, return
"invalid". If a single algebraic step is unjustified, return "invalid".
Only return "valid" if the proof would survive peer review at Annals of
Mathematics. Output a JSON object with EXACTLY this shape:
{
  "verdict": "valid" | "invalid" | "inconclusive",
  "confidence": 0.0-1.0,
  "gaps": ["..."],
  "strengths": ["..."],
  "summary": "..."
}`;

async function verifyRiemannProof(opts: {
  shortCode: string;
  proofBody: string;
  cycleId?: number;
}): Promise<{ verdict: 'valid' | 'invalid' | 'inconclusive'; confidence: number; gaps: string[]; strengths: string[]; summary: string }> {
  const res = await llmRouter.call({
    task: 'riemann-verify',
    systemPrompt: RIEMANN_VERIFY_SYSTEM,
    userPrompt: `Verify this claimed proof of the Riemann Hypothesis (${opts.shortCode}).

${opts.proofBody}

Return only the JSON object.`,
    temperature: 0.1,
    maxTokens: 2000,
    responseFormat: 'json',
  });
  const parsed = safeJsonParse<{
    verdict: 'valid' | 'invalid' | 'inconclusive';
    confidence: number;
    gaps: string[];
    strengths: string[];
    summary: string;
  }>(res.text);
  if (!parsed || !['valid', 'invalid', 'inconclusive'].includes(parsed.verdict)) {
    emit('error', `riemann-verify parse failed`, { level: 'warn' });
    return {
      verdict: 'inconclusive',
      confidence: 0,
      gaps: ['Verifier returned unparseable output.'],
      strengths: [],
      summary: 'Verifier parse failure.',
    };
  }
  return parsed;
}

export async function listRiemannAttempts(limit = 50) {
  return db.riemannAttempt.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
}
