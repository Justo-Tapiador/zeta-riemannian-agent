// zeta-riemannian-agent v1.0 — Theorem Archivist
//
// Promotes a verified proof attempt to a Theorem. Tags it, indexes it,
// and stores the LaTeX + (optionally) PDF in research/theorems/.

import { db } from '@/lib/db';
import { emit } from './logger';
import { writeTex, writeSidecar, theoremTex, makeShortCode, rel, DIRS } from './document-archivist';
import { compileTex } from './latex-compiler';

let theoremSeq = 0;

async function nextSeq(): Promise<number> {
  if (theoremSeq === 0) {
    const count = await db.theorem.count();
    theoremSeq = count + 1;
  } else {
    theoremSeq++;
  }
  return theoremSeq;
}

export async function promoteToTheorem(opts: {
  hypothesisId: string;
  proofAttemptId: string;
  cycleId?: number;
}): Promise<{ shortCode: string; dbId: string; texPath: string; pdfPath: string | null }> {
  const hyp = await db.hypothesis.findUnique({ where: { id: opts.hypothesisId } });
  const attempt = await db.proofAttempt.findUnique({ where: { id: opts.proofAttemptId } });
  if (!hyp || !attempt) throw new Error('hypothesis or attempt missing');

  const seq = await nextSeq();
  const shortCode = makeShortCode('T', seq);

  const tags = inferTags(hyp.statement, attempt.approach);
  const usesTheoremShortCodes: string[] = (() => {
    try {
      const meta = JSON.parse(attempt.verifierReport || '{}');
      void meta;
      return [];
    } catch {
      return [];
    }
  })();
  // Theorem dependencies — parse the proof's tool list from sidecar.
  // For simplicity we leave it empty if not available.
  const fullTex = theoremTex({
    shortCode,
    title: hyp.title,
    statement: hyp.statement,
    proofBody: extractProofBody(attempt.texSource),
    tags,
    usesTheoremShortCodes,
    provenFromHypothesis: hyp.shortCode,
  });

  const texAbs = writeTex('theorems', `${shortCode}.tex`, fullTex);
  const compile = await compileTex(fullTex, DIRS.theorems, shortCode);
  const pdfRel = compile.pdfPath ? rel(compile.pdfPath) : null;

  const created = await db.theorem.create({
    data: {
      shortCode,
      title: hyp.title,
      statement: hyp.statement,
      proofTexSource: fullTex,
      proofTexPath: rel(texAbs),
      proofPdfPath: pdfRel,
      hypothesisId: hyp.id,
      attemptId: attempt.id,
      tags: JSON.stringify(tags),
      usesTheoremIds: JSON.stringify(usesTheoremShortCodes),
    },
  });

  await db.hypothesis.update({
    where: { id: hyp.id },
    data: { status: 'proven' },
  });

  writeSidecar('theorems', `${shortCode}.tags.json`, {
    shortCode,
    tags,
    hypothesisShortCode: hyp.shortCode,
    proofShortCode: attempt.shortCode,
    cycleId: opts.cycleId ?? null,
    promotedAt: new Date().toISOString(),
  });

  emit(
    'theorem-promoted',
    `${shortCode} promoted — ${hyp.title}`,
    {
      cycleId: opts.cycleId,
      payload: {
        shortCode,
        title: hyp.title,
        tags,
        compiled: compile.ok,
      },
    }
  );

  return { shortCode, dbId: created.id, texPath: rel(texAbs), pdfPath: pdfRel };
}

export async function listTheorems(limit = 50) {
  return db.theorem.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    include: { hypothesis: true, attempt: true },
  });
}

export async function toolkitSummary(limit = 12): Promise<{ shortCode: string; title: string; statement: string; tags: string[] }[]> {
  const theorems = await db.theorem.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
  return theorems.map((t) => ({
    shortCode: t.shortCode,
    title: t.title,
    statement: t.statement,
    tags: safeParse(t.tags, []),
  }));
}

function extractProofBody(fullTex: string): string {
  // Try to extract everything between \section{Proof} and \end{document} or the next \section.
  const m = fullTex.match(/\\section\{Proof\}([\s\S]*?)(?:\\section\{|\\end\{document\})/);
  if (m) return m[1].trim();
  return fullTex; // fallback
}

function inferTags(statement: string, approach: string): string[] {
  const s = (statement + ' ' + approach).toLowerCase();
  const tags: string[] = [];
  if (s.includes('critical line') || s.includes('re(s) = 1/2') || s.includes('re(s)=1/2')) tags.push('critical-line');
  if (s.includes('critical strip') || s.includes('0 < re(s) < 1')) tags.push('critical-strip');
  if (s.includes('xi(') || s.includes('xi function') || s.includes('completed zeta')) tags.push('xi-function');
  if (s.includes('zeta(') || s.includes('zeta function')) tags.push('zeta-function');
  if (s.includes('functional equation')) tags.push('functional-equation');
  if (s.includes('explicit formula')) tags.push('explicit-formula');
  if (s.includes('l-function') || s.includes('dirichlet')) tags.push('l-functions');
  if (s.includes('selberg')) tags.push('selberg-class');
  if (s.includes('hilbert') || s.includes('polya') || s.includes('self-adjoint')) tags.push('hilbert-polya');
  if (s.includes('random matrix') || s.includes('gue')) tags.push('random-matrix');
  if (s.includes('contour integral') || s.includes('contour integration') || s.includes('residue')) tags.push('complex-analysis');
  if (s.includes('contradiction')) tags.push('proof-by-contradiction');
  if (s.includes('induction')) tags.push('proof-by-induction');
  if (s.includes('operator') || s.includes('spectrum') || s.includes('eigenvalue')) tags.push('spectral-theory');
  if (tags.length === 0) tags.push('misc');
  return tags;
}

function safeParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}
