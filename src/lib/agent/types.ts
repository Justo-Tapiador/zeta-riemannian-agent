// zeta-riemannian-agent v1.0 — shared types
// All documents, hypotheses, and proofs in this repository are in English.

export type AgentPhase =
  | 'arxiv-scan'
  | 'hypothesis-gen'
  | 'proof-attempt'
  | 'riemann-attempt'
  | 'archive'
  | 'idle';

export interface AgentEvent {
  kind:
    | 'cycle-start'
    | 'cycle-end'
    | 'phase-change'
    | 'arxiv-fetched'
    | 'hypothesis-proposed'
    | 'proof-started'
    | 'proof-finished'
    | 'theorem-promoted'
    | 'riemann-attempt-started'
    | 'riemann-attempt-finished'
    | 'riemann-proven' // *** THE ALERT ***
    | 'llm-call'
    | 'llm-error'
    | 'doc-written'
    | 'pdf-compiled'
    | 'kg-updated'
    | 'owner-directive-applied'
    | 'owner-directive-rejected'
    | 'log'
    | 'error';
  cycleId?: number;
  phase?: AgentPhase;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  level?: 'info' | 'warn' | 'error' | 'debug' | 'critical';
}

export interface HypothesisDraft {
  title: string;
  statement: string;
  motivation: string;
  strategySketch: string;
  relatedConcepts: string[]; // KG node labels
  relatedArxivIds: string[];
  confidence: number;
}

export interface ProofDraft {
  approach: string;
  texSource: string;
  usesTheoremShortCodes: string[];
  usesArxivIds: string[];
  strategySummary: string;
}

export interface VerifierReport {
  verdict: 'valid' | 'invalid' | 'inconclusive';
  confidence: number;
  gaps: string[];
  strengths: string[];
  summary: string;
}

export interface OwnerDirectivePayload {
  kind:
    | 'set-focus'
    | 'halt'
    | 'resume'
    | 'inject-hypothesis'
    | 'rerun-cycle'
    | 'priority'
    | 'force-phase'
    | 'force-riemann-attempt'
    | 'shutdown';
  focus?: string;
  hypothesisDraft?: HypothesisDraft;
  phase?: AgentPhase;
  note?: string;
}

export interface AgentSnapshot {
  isRunning: boolean;
  isHalted: boolean;
  riemannProven: boolean;
  riemannProvenAt: string | null;
  currentCycleId: number | null;
  currentPhase: AgentPhase;
  totalCycles: number;
  totalHypotheses: number;
  totalTheorems: number;
  totalArxivPapers: number;
  totalRiemannAttempts: number;
  focusTopic: string | null;
  lastEvent: AgentEvent | null;
  uptimeMs: number;
}
