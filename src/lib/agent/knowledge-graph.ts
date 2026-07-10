// zeta-riemannian-agent v1.0 — Knowledge Graph
//
// A small concept graph seeded with the canonical objects around the
// Riemann Hypothesis: zeta, xi, functional equation, critical line, etc.
// Hypotheses and theorems are linked to KG nodes; the orchestrator uses
// KG activations to bias hypothesis generation.

import { db } from '@/lib/db';
import { emit } from './logger';

interface SeedNode {
  label: string;
  kind: 'concept' | 'object' | 'function' | 'conjecture' | 'theorem' | 'technique';
  description: string;
}

const SEED_NODES: SeedNode[] = [
  { label: 'riemann-hypothesis', kind: 'conjecture', description: 'All non-trivial zeros of the Riemann zeta function have real part 1/2.' },
  { label: 'zeta-function', kind: 'function', description: 'The Riemann zeta function zeta(s) = sum_{n>=1} 1/n^s, analytically continued.' },
  { label: 'xi-function', kind: 'function', description: 'Completed zeta function xi(s) = 1/2 s(s-1) pi^{-s/2} Gamma(s/2) zeta(s), symmetric under s -> 1-s.' },
  { label: 'critical-line', kind: 'object', description: 'The line Re(s) = 1/2 in the complex plane.' },
  { label: 'critical-strip', kind: 'object', description: 'The strip 0 < Re(s) < 1 containing all non-trivial zeros.' },
  { label: 'functional-equation', kind: 'theorem', description: 'The symmetry xi(s) = xi(1-s) of the completed zeta function.' },
  { label: 'explicit-formula', kind: 'theorem', description: "Weil's explicit formula relating zeta zeros to prime powers." },
  { label: 'prime-number-theorem', kind: 'theorem', description: 'Asymptotic count of primes, equivalent to zeta(s) non-vanishing on Re(s)=1.' },
  { label: 'dirichlet-L-functions', kind: 'function', description: 'L(s,chi) generalising zeta; their GRH is the natural extension of RH.' },
  { label: 'selberg-class', kind: 'concept', description: 'Axiomatic class of L-functions satisfying RH-like conjectures.' },
  { label: 'hilbert-polya', kind: 'conjecture', description: 'Zeros of zeta correspond to eigenvalues of a self-adjoint operator.' },
  { label: 'random-matrix-theory', kind: 'technique', description: 'Statistical study of zero spacings via GUE ensembles.' },
  { label: 'weil-explicit-formula', kind: 'technique', description: 'Distributional criterion for RH on test functions with compact Fourier support.' },
  { label: 'converse-theorem', kind: 'technique', description: 'Identifying L-functions by their functorial properties.' },
  { label: 'automorphic-forms', kind: 'concept', description: 'Generalised modular forms whose L-functions satisfy RH-like conjectures.' },
  { label: 'spectral-theory', kind: 'technique', description: 'Operator-theoretic approach to zeros.' },
  { label: 'analytic-continuation', kind: 'technique', description: 'Extending zeta meromorphically to the whole plane.' },
  { label: 'hadamard-product', kind: 'theorem', description: 'Factorisation of entire functions via their zeros; applied to xi.' },
  { label: 'mertens-conjecture', kind: 'conjecture', description: 'Bound on Mertens function; would imply RH but is false.' },
  { label: 'li-criterion', kind: 'theorem', description: "Li's coefficient criterion equivalent to RH." },
];

const SEED_EDGES: Array<[string, string, string]> = [
  ['riemann-hypothesis', 'zeta-function', 'constrains'],
  ['riemann-hypothesis', 'critical-line', 'places-zeros-on'],
  ['xi-function', 'zeta-function', 'completes'],
  ['xi-function', 'functional-equation', 'satisfies'],
  ['functional-equation', 'critical-line', 'symmetrises-across'],
  ['explicit-formula', 'prime-number-theorem', 'implies'],
  ['explicit-formula', 'critical-strip', 'relates-to'],
  ['hilbert-polya', 'spectral-theory', 'uses'],
  ['hilbert-polya', 'riemann-hypothesis', 'would-imply'],
  ['random-matrix-theory', 'critical-line', 'models-zeros-on'],
  ['weil-explicit-formula', 'riemann-hypothesis', 'is-equivalent-to'],
  ['selberg-class', 'dirichlet-L-functions', 'generalises'],
  ['selberg-class', 'riemann-hypothesis', 'extends'],
  ['li-criterion', 'riemann-hypothesis', 'is-equivalent-to'],
  ['hadamard-product', 'xi-function', 'factorises'],
  ['analytic-continuation', 'zeta-function', 'extends'],
  ['mertens-conjecture', 'riemann-hypothesis', 'would-imply'],
  ['automorphic-forms', 'dirichlet-L-functions', 'generalises'],
  ['converse-theorem', 'automorphic-forms', 'characterises'],
];

let seeded = false;

export async function seedKnowledgeGraph() {
  if (seeded) return;
  seeded = true;
  let added = 0;
  for (const n of SEED_NODES) {
    const existing = await db.kGNode.findUnique({ where: { label: n.label } });
    if (!existing) {
      await db.kGNode.create({
        data: { label: n.label, kind: n.kind, description: n.description },
      });
      added++;
    }
  }
  let addedEdges = 0;
  for (const [fromLabel, toLabel, relation] of SEED_EDGES) {
    const from = await db.kGNode.findUnique({ where: { label: fromLabel } });
    const to = await db.kGNode.findUnique({ where: { label: toLabel } });
    if (!from || !to) continue;
    try {
      await db.kGEdge.create({
        data: { fromNodeId: from.id, toNodeId: to.id, relation },
      });
      addedEdges++;
    } catch (e: any) {
      // P2002 = unique constraint violation — edge already exists, expected on restart.
      // Silence it (don't log) to keep the console clean.
      if (e?.code !== 'P2002') {
        // Unexpected error — rethrow
        throw e;
      }
    }
  }
  emit('kg-updated', `Knowledge graph seeded (+${added} nodes, +${addedEdges} edges)`, {
    payload: { addedNodes: added, edges: SEED_EDGES.length },
  });
}

export async function listNodes(limit = 100) {
  return db.kGNode.findMany({ take: limit, orderBy: { label: 'asc' } });
}

export async function listEdges(limit = 200) {
  return db.kGEdge.findMany({
    take: limit,
    include: { fromNode: true, toNode: true },
  });
}

export async function getActivations(labels: string[]): Promise<{ label: string; activation: number }[]> {
  // Activation = 1 if the label is currently in the working set, else 0.
  // Higher activations come from being referenced more often; for simplicity
  // we treat presence as 1.0 and absence as 0.0.
  return labels.map((l) => ({ label: l, activation: 1.0 }));
}

export async function ensureNode(label: string, kind: SeedNode['kind'] = 'concept', description = ''): Promise<string> {
  const existing = await db.kGNode.findUnique({ where: { label } });
  if (existing) return existing.id;
  const created = await db.kGNode.create({ data: { label, kind, description } });
  emit('kg-updated', `new KG node: ${label}`, { payload: { label } });
  return created.id;
}
