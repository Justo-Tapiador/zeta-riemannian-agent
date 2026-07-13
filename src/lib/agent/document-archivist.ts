// zeta-riemannian-agent v1.0 — Document Archivist
//
// Hierarchical local archive layout (rooted at process.cwd()/research):
//
//   research/
//     INDEX.md                      — auto-regenerated top-level index
//     hypotheses/
//       H-YYYY-NNNN.tex             — one TeX file per proposed hypothesis
//       H-YYYY-NNNN.meta.json       — sidecar metadata
//     proofs/
//       PA-YYYY-NNNN.tex            — one TeX file per proof attempt
//       PA-YYYY-NNNN.pdf            — compiled PDF (when tectonic is available)
//       PA-YYYY-NNNN.verifier.json  — verifier report sidecar
//     theorems/
//       T-YYYY-NNNN.tex
//       T-YYYY-NNNN.pdf
//       T-YYYY-NNNN.tags.json
//     arxiv-cache/
//       <arxivId>.abstract.txt      — cached abstract
//       <arxivId>.summary.md        — agent-generated summary
//     riemann-attempts/
//       RH-YYYY-NNNN.tex
//       RH-YYYY-NNNN.pdf
//       RH-YYYY-NNNN.verifier.json
//     cross_refs.json               — global cross-reference map
//
// All filenames are URL-safe and timestamp-stable.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { emit } from './logger';

// Resolve the project root by walking up from this file (src/lib/agent/).
// This guarantees the research/ archive always lives at <project-root>/research
// regardless of which process (Next.js dev server, agent-runtime mini-service,
// CLI) imports this module.
function findProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'prisma'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const RESEARCH_ROOT = path.join(PROJECT_ROOT, 'research');

export const DIRS = {
  root: RESEARCH_ROOT,
  hypotheses: path.join(RESEARCH_ROOT, 'hypotheses'),
  proofs: path.join(RESEARCH_ROOT, 'proofs'),
  theorems: path.join(RESEARCH_ROOT, 'theorems'),
  arxiv: path.join(RESEARCH_ROOT, 'arxiv-cache'),
  riemann: path.join(RESEARCH_ROOT, 'riemann-attempts'),
  // Alias for callers that use the full directory name.
  'riemann-attempts': path.join(RESEARCH_ROOT, 'riemann-attempts'),
} as const;

export function ensureDirs() {
  for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });
}

const YEAR = () => new Date().getFullYear();

export function makeShortCode(prefix: 'H' | 'PA' | 'T' | 'RH', seq: number): string {
  return `${prefix}-${YEAR()}-${String(seq).padStart(4, '0')}`;
}

export function writeTex(dir: keyof typeof DIRS, fileName: string, source: string): string {
  ensureDirs();
  const full = path.join(DIRS[dir], fileName);
  writeFileSync(full, source, 'utf8');
  emit('doc-written', `wrote ${path.relative(process.cwd(), full)}`, {
    payload: { path: full },
  });
  return full;
}

export function writeSidecar(
  dir: keyof typeof DIRS,
  fileName: string,
  data: unknown
): string {
  ensureDirs();
  const full = path.join(DIRS[dir], fileName);
  writeFileSync(full, JSON.stringify(data, null, 2), 'utf8');
  return full;
}

export function readSidecar<T = unknown>(dir: keyof typeof DIRS, fileName: string): T | null {
  const full = path.join(DIRS[dir], fileName);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8')) as T;
  } catch {
    return null;
  }
}

// Convert an absolute path to a path relative to the project root, for DB storage.
export function rel(absPath: string): string {
  return path.relative(process.cwd(), absPath);
}

// ---------------------------------------------------------------------------
// LaTeX templates
// ---------------------------------------------------------------------------

export function hypothesisTex(opts: {
  shortCode: string;
  title: string;
  statement: string;
  motivation: string;
  strategySketch: string;
  relatedConcepts: string[];
  relatedArxivIds: string[];
  confidence: number;
}): string {
  const concepts = opts.relatedConcepts.map((c) => `\\item ${c}`).join('\n');
  const arxivs = opts.relatedArxivIds.map((a) => `\\item \\href{https://arxiv.org/abs/${a}}{arXiv:${a}}`).join('\n');
  return `\\documentclass[11pt]{article}
\\usepackage[a4paper,margin=1in]{geometry}
\\usepackage{amsmath,amssymb,amsthm,mathtools}
\\usepackage{hyperref}
\\usepackage{microtype}
\\usepackage{cleveref}

\\newtheorem{hypothesis}{Hypothesis}
\\newtheorem{remark}{Remark}

\\title{${opts.shortCode}: ${escapeTex(opts.title)}}
\\author{zRiemannian (zeta-riemannian-agent v1.0)}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
This is a hypothesis proposed by the autonomous agent zRiemannian as part of its
research programme on the Riemann Hypothesis. It has not yet been proven; see
the accompanying proof attempts under \\texttt{research/proofs/}.
\\end{abstract}

\\section{Statement}
\\begin{hypothesis}[${opts.shortCode}]
${indentTex(opts.statement)}
\\end{hypothesis}

\\section{Motivation}
${escapeTex(opts.motivation)}

\\section{Proof strategy sketch}
${escapeTex(opts.strategySketch)}

\\section{Related concepts}
\\begin{itemize}
${concepts || '\\item (none yet)'}
\\end{itemize}

\\section{Related ArXiv preprints}
\\begin{itemize}
${arxivs || '\\item (none yet)'}
\\end{itemize}

\\begin{remark}
Agent self-assessed confidence: ${opts.confidence.toFixed(2)}.
This hypothesis was generated by the AJN backbone of zRiemannian; it should be
treated as a research prompt, not as an established result.
\\end{remark}

\\end{document}
`;
}

export function proofTex(opts: {
  shortCode: string;
  hypothesisShortCode: string;
  hypothesisTitle: string;
  approach: string;
  body: string; // LaTeX body of the proof (may include \begin{proof}...\end{proof})
  usesTheoremShortCodes: string[];
  usesArxivIds: string[];
}): string {
  const usesT = opts.usesTheoremShortCodes.map((c) => `\\item ${c}`).join('\n');
  const usesA = opts.usesArxivIds
    .map((a) => `\\item \\href{https://arxiv.org/abs/${a}}{arXiv:${a}}`)
    .join('\n');
  return `\\documentclass[11pt]{article}
\\usepackage[a4paper,margin=1in]{geometry}
\\usepackage{amsmath,amssymb,amsthm,mathtools}
\\usepackage{hyperref}
\\usepackage{microtype}

\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}{Lemma}
\\newtheorem{remark}{Remark}

\\title{${opts.shortCode}: Proof attempt of ${opts.hypothesisShortCode}}
\\author{zRiemannian (zeta-riemannian-agent v1.0)}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Autonomous proof attempt by zRiemannian of the hypothesis
\\textbf{${opts.hypothesisShortCode}}: \\emph{${escapeTex(opts.hypothesisTitle)}}.
Approach: \\textbf{${escapeTex(opts.approach)}}. The verifier's report is
stored alongside this document as a JSON sidecar.
\\end{abstract}

\\section{Target hypothesis}
\\textbf{${opts.hypothesisShortCode}.} See \\texttt{research/hypotheses/${opts.hypothesisShortCode}.tex}.

\\section{Tools used}
\\subsection*{Theorems}
\\begin{itemize}
${usesT || '\\item (none)'}
\\end{itemize}
\\subsection*{ArXiv references}
\\begin{itemize}
${usesA || '\\item (none)'}
\\end{itemize}

\\section{Proof}
${opts.body}

\\end{document}
`;
}

export function theoremTex(opts: {
  shortCode: string;
  title: string;
  statement: string;
  proofBody: string;
  tags: string[];
  usesTheoremShortCodes: string[];
  provenFromHypothesis: string;
}): string {
  const tags = opts.tags.map((t) => `\\item ${escapeTex(t)}`).join('\n');
  const usesT = opts.usesTheoremShortCodes.map((c) => `\\item ${c}`).join('\n');
  return `\\documentclass[11pt]{article}
\\usepackage[a4paper,margin=1in]{geometry}
\\usepackage{amsmath,amssymb,amsthm,mathtools}
\\usepackage{hyperref}
\\usepackage{microtype}

\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}{Lemma}

\\title{${opts.shortCode}: ${escapeTex(opts.title)}}
\\author{zRiemannian (zeta-riemannian-agent v1.0)}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
This is a theorem produced by zRiemannian after a verified proof attempt.
It is now part of the agent's reusable toolkit and may be cited by future
proof attempts.
\\end{abstract}

\\section{Statement}
\\begin{theorem}[${opts.shortCode}]
${indentTex(opts.statement)}
\\end{theorem}

\\section{Proof}
${opts.proofBody}

\\section{Tags}
\\begin{itemize}
${tags || '\\item (none)'}
\\end{itemize}

\\section{Dependencies}
\\begin{itemize}
${usesT || '\\item (none — primitive)'}
\\end{itemize}

\\section{Lineage}
Promoted from hypothesis \\textbf{${opts.provenFromHypothesis}} after a
verifier-accepted proof attempt.

\\end{document}
`;
}

export function riemannAttemptTex(opts: {
  shortCode: string;
  strategy: string;
  body: string;
  usesTheoremShortCodes: string[];
  usesArxivIds: string[];
}): string {
  const usesT = opts.usesTheoremShortCodes.map((c) => `\\item ${c}`).join('\n');
  const usesA = opts.usesArxivIds
    .map((a) => `\\item \\href{https://arxiv.org/abs/${a}}{arXiv:${a}}`)
    .join('\n');
  return `\\documentclass[11pt]{article}
\\usepackage[a4paper,margin=1in]{geometry}
\\usepackage{amsmath,amssymb,amsthm,mathtools}
\\usepackage{hyperref}
\\usepackage{microtype}

\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}{Lemma}

\\title{${opts.shortCode}: Attempted proof of the Riemann Hypothesis}
\\author{zRiemannian (zeta-riemannian-agent v1.0)}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Autonomous attempt by zRiemannian to prove the Riemann Hypothesis. Strategy:
\\textbf{${escapeTex(opts.strategy)}}. This document is one of a sequence
of periodic attempts archived under \\texttt{research/riemann-attempts/}.
\\end{abstract}

\\section{Strategy}
${escapeTex(opts.strategy)}

\\section{Tools used}
\\subsection*{Theorems}
\\begin{itemize}
${usesT || '\\item (none)'}
\\end{itemize}
\\subsection*{ArXiv references}
\\begin{itemize}
${usesA || '\\item (none)'}
\\end{itemize}

\\section{Proof attempt}
${opts.body}

\\end{document}
`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function escapeTex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function indentTex(s: string): string {
  // Do NOT escape — caller is expected to provide valid TeX. Just indent.
  return s
    .split('\n')
    .map((l) => (l.trim() ? '  ' + l : l))
    .join('\n');
}
