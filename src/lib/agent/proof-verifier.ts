// zeta-riemannian-agent v1.0 — Proof Verifier
//
// A second LLM pass that adversarially inspects a proof attempt and returns
// a structured verdict. The orchestrator promotes the proof to a theorem
// ONLY when verdict === 'valid' AND confidence >= PROMOTION_THRESHOLD.

import { db } from '@/lib/db';
import llmRouter from './llm-router';
import { emit } from './logger';
import type { VerifierReport } from './types';
import { writeSidecar } from './document-archivist';
import { safeJsonParse } from './json-utils';

export const PROMOTION_THRESHOLD = 0.75;

const SYSTEM_PROMPT = `You are zRiemannian's adversarial proof verifier. You are given a
mathematical hypothesis and a proof attempt. Your job is to decide
whether the proof is VALID. Be strict and skeptical. Look for:
  - circular reasoning,
  - hidden assumptions not stated in the hypothesis,
  - misuse of cited theorems,
  - algebraic or analytic errors,
  - gaps in the logical chain.

Return a single JSON object with EXACTLY this shape:
{
  "verdict": "valid" | "invalid" | "inconclusive",
  "confidence": 0.0-1.0,
  "gaps": ["specific gap 1", "specific gap 2"],
  "strengths": ["specific strength 1"],
  "summary": "one paragraph summary"
}

If the proof has any concrete logical gap, return "invalid" with a low
confidence. Only return "valid" if you would defend the proof in front
of a professional number theorist.`;

export async function verifyProof(opts: {
  proofAttemptId: string;
  shortCode: string;
  hypothesisShortCode: string;
  hypothesisStatement: string;
  proofBody: string;
  cycleId?: number;
}): Promise<VerifierReport> {
  const userPrompt = `HYPOTHESIS ${opts.hypothesisShortCode}:
${opts.hypothesisStatement}

PROOF ATTEMPT ${opts.shortCode} (LaTeX body):
${opts.proofBody}

Verify the proof. Return only the JSON object.`;

  const res = await llmRouter.call({
    task: 'proof-verify',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.2,
    maxTokens: 1500,
    responseFormat: 'json',
  });

  let report: VerifierReport | null = safeJsonParse<VerifierReport>(res.text);
  if (!report || !['valid', 'invalid', 'inconclusive'].includes(report.verdict)) {
    emit('error', `verifier JSON parse failed`, {
      level: 'warn',
      payload: { raw: res.text.slice(0, 300) },
    });
    report = {
      verdict: 'inconclusive',
      confidence: 0,
      gaps: ['Verifier returned unparseable output.'],
      strengths: [],
      summary: 'Verifier parse failure.',
    };
  }

  await db.proofAttempt.update({
    where: { id: opts.proofAttemptId },
    data: {
      verifierReport: JSON.stringify(report, null, 2),
      verdict: report.verdict,
      verifierConfidence: report.confidence,
    },
  });

  writeSidecar('proofs', `${opts.shortCode}.verifier.json`, {
    shortCode: opts.shortCode,
    report,
    model: res.model,
    provider: res.provider,
    cycleId: opts.cycleId ?? null,
    verifiedAt: new Date().toISOString(),
  });

  emit(
    'proof-finished',
    `${opts.shortCode} verdict=${report.verdict} conf=${report.confidence.toFixed(2)}`,
    {
      cycleId: opts.cycleId,
      payload: {
        shortCode: opts.shortCode,
        verdict: report.verdict,
        confidence: report.confidence,
        gaps: report.gaps,
      },
    }
  );

  return report;
}
