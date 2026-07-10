// zeta-riemannian-agent v1.0 — ANN-Psi Backbone (14 layers, AJN + Transformer)
//
// Lineage: predator-jungle-agent v2.0 -> fusionary-agent -> quantum-spherifier
//          -> zeta-riemannian-agent v1.0
//
// The Artificial Junky Neuron (AJN) is the defining architectural primitive
// inherited from predator-jungle-agent. An AJN neuron is "addicted" to its
// task domain: it fires autonomously when the agent is launched and does NOT
// wait for an external request. This is the structural reason zRiemannian
// starts producing mathematical hypotheses the moment it is activated.
//
// The 14-layer backbone below is a TypeScript re-implementation of the
// predator-jungle-agent backbone, re-targeted for mathematical research:
//
//   L1-L2   Hybrid AJN        — sensory intake (ArXiv abstracts, KG deltas)
//   L3      Hetero AJN K=8    — multi-head pattern detection across the cache
//   L4-L5   Transformer       — long-range self-attention over hypotheses
//   L6      Hetero AJN K=16   — cross-link synthesis (theorems <-> hypotheses)
//   L7      Hybrid AJN        — strategy selection
//   L8-L9   Transformer       — proof-sketch generation and refinement
//   L10     Hetero AJN K=32   — deep verification routing
//   L11     Hybrid AJN        — verdict aggregation
//   L12     Hetero AJN K=8    — archival decision
//   L13     Hybrid AJN        — Riemann-prober trigger evaluation
//   L14     Output AJN        — final emission (doc, event, or alert)
//
// In this TypeScript re-implementation we keep the LAYER SCHEMA and the
// hetero/hybrid K-pattern of the original, but the actual computation is
// delegated to a task-routed multi-LLM ensemble (see llm-router.ts). Each
// "layer" is therefore a function that consumes the upstream context vector
// (a structured object) and augments it, mirroring the predator-jungle-agent
// convention of treating the context as a rolling symbolic state.

import { emit, log } from './logger';
import type { AgentPhase, AgentEvent } from './types';

export type NeuronKind = 'ajn-hybrid' | 'ajn-hetero' | 'transformer' | 'output';

export interface LayerSpec {
  index: number;
  name: string;
  kind: NeuronKind;
  k?: number; // for hetero AJN, the head count
  role: string;
}

export const BACKBONE_LAYERS: LayerSpec[] = [
  { index: 1,  name: 'Sensory-A', kind: 'ajn-hybrid',  role: 'ArXiv abstract intake' },
  { index: 2,  name: 'Sensory-B', kind: 'ajn-hybrid',  role: 'KG delta intake' },
  { index: 3,  name: 'Pattern-8', kind: 'ajn-hetero',  k: 8,  role: 'Multi-head pattern detection across cache' },
  { index: 4,  name: 'Attn-Lo-1', kind: 'transformer', role: 'Long-range self-attention over hypotheses' },
  { index: 5,  name: 'Attn-Lo-2', kind: 'transformer', role: 'Hypothesis cluster formation' },
  { index: 6,  name: 'XL-16',     kind: 'ajn-hetero',  k: 16, role: 'Cross-link synthesis: theorems <-> hypotheses' },
  { index: 7,  name: 'Strategy',  kind: 'ajn-hybrid',  role: 'Proof-strategy selection' },
  { index: 8,  name: 'Sketch-1',  kind: 'transformer', role: 'Proof-sketch generation' },
  { index: 9,  name: 'Sketch-2',  kind: 'transformer', role: 'Proof-sketch refinement' },
  { index: 10, name: 'Verify-32', kind: 'ajn-hetero',  k: 32, role: 'Deep verification routing' },
  { index: 11, name: 'Verdict',   kind: 'ajn-hybrid',  role: 'Verdict aggregation' },
  { index: 12, name: 'Archive',   kind: 'ajn-hetero',  k: 8,  role: 'Archival decision' },
  { index: 13, name: 'RH-Trigger',kind: 'ajn-hybrid',  role: 'Riemann-prober trigger evaluation' },
  { index: 14, name: 'Emit',      kind: 'output',      role: 'Final emission: doc / event / alert' },
];

// The rolling symbolic state that flows through the backbone.
export interface ContextVector {
  cycleId: number;
  phase: AgentPhase;
  arxivDigests: { id: string; title: string; relevance: number }[];
  kgActivations: { label: string; activation: number }[];
  candidateHypotheses: { shortCode: string; title: string; confidence: number }[];
  openTheorems: { shortCode: string; title: string }[];
  chosenStrategy?: string;
  sketch?: string;
  verdict?: 'pending' | 'valid' | 'invalid' | 'inconclusive';
  shouldTriggerRiemann?: boolean;
  emission?: { kind: 'doc' | 'event' | 'alert'; ref: string };
  layerTrail: number[]; // indices of layers that have fired
}

export function initialContext(cycleId: number, phase: AgentPhase): ContextVector {
  return {
    cycleId,
    phase,
    arxivDigests: [],
    kgActivations: [],
    candidateHypotheses: [],
    openTheorems: [],
    layerTrail: [],
  };
}

export interface BackboneFirer {
  fire(ctx: ContextVector, layer: LayerSpec): Promise<void>;
}

// A "firing" here is symbolic: it logs the layer activation and tags the
// context so downstream consumers (and the UI) can see which layers fired.
// The actual intelligence lives in the LLM-router calls invoked by the
// orchestrator between layers.
export async function fireLayer(
  ctx: ContextVector,
  layer: LayerSpec,
  extra?: Record<string, unknown>
): Promise<void> {
  ctx.layerTrail.push(layer.index);
  const ev: AgentEvent = {
    kind: 'log',
    message: `layer ${layer.index}/${layer.name} fired (${layer.kind}${
      layer.k ? ` K=${layer.k}` : ''
    }) — ${layer.role}`,
    cycleId: ctx.cycleId,
    phase: ctx.phase,
    payload: { layer: layer.index, name: layer.name, kind: layer.kind, k: layer.k, extra },
    timestamp: new Date().toISOString(),
    level: 'debug',
  };
  // Mirror to logger ring but suppress console spam (debug).
  emit('log', ev.message, {
    cycleId: ctx.cycleId,
    phase: ctx.phase,
    payload: ev.payload,
    level: 'debug',
    console: false,
  });
}

// AJN activation policy: returns true if the neuron should fire NOW, given
// the context. The "addiction" property is encoded by always returning true
// when the agent is running and not halted; the orchestrator controls halt.
export function ajnAddictionPolicy(ctx: ContextVector): boolean {
  // The neuron is addicted: it always wants to fire when a cycle is active.
  return ctx.cycleId > 0;
}

export function describeBackbone(): string {
  return BACKBONE_LAYERS.map(
    (l) => `L${l.index} ${l.name} (${l.kind}${l.k ? ` K=${l.k}` : ''}) — ${l.role}`
  ).join('\n');
}

export function backboneSummary(): {
  totalLayers: number;
  ajnHybrid: number;
  ajnHetero: number;
  transformer: number;
  output: number;
  maxK: number;
} {
  const ajnHybrid = BACKBONE_LAYERS.filter((l) => l.kind === 'ajn-hybrid').length;
  const ajnHetero = BACKBONE_LAYERS.filter((l) => l.kind === 'ajn-hetero').length;
  const transformer = BACKBONE_LAYERS.filter((l) => l.kind === 'transformer').length;
  const output = BACKBONE_LAYERS.filter((l) => l.kind === 'output').length;
  const maxK = Math.max(0, ...BACKBONE_LAYERS.map((l) => l.k ?? 0));
  return {
    totalLayers: BACKBONE_LAYERS.length,
    ajnHybrid,
    ajnHetero,
    transformer,
    output,
    maxK,
  };
}

export const backboneSelfCheck = () => {
  const s = backboneSummary();
  log.info('ANN-Psi backbone ready', s);
  return s;
};
