'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  CircleStop,
  Database,
  FileText,
  FlaskConical,
  Github,
  Lightbulb,
  Network,
  Play,
  Send,
  Sigma,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — mirror src/lib/agent/types.ts
// ---------------------------------------------------------------------------
type AgentPhase =
  | 'arxiv-scan'
  | 'hypothesis-gen'
  | 'proof-attempt'
  | 'riemann-attempt'
  | 'archive'
  | 'idle';

interface AgentEvent {
  kind: string;
  cycleId?: number;
  phase?: AgentPhase;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  level?: 'info' | 'warn' | 'error' | 'debug' | 'critical';
}

interface AgentSnapshot {
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

interface HypothesisRow {
  id: string;
  shortCode: string;
  title: string;
  statement: string;
  motivation: string;
  strategySketch: string;
  confidence: number;
  status: string;
  createdAt: string;
  relatedConcepts: string;
  relatedArxivIds: string;
  _count?: { attempts: number };
}

interface TheoremRow {
  id: string;
  shortCode: string;
  title: string;
  statement: string;
  proofTexPath: string;
  proofPdfPath: string | null;
  tags: string;
  createdAt: string;
  hypothesis: { shortCode: string };
  attempt: { shortCode: string };
}

interface RiemannAttemptRow {
  id: string;
  shortCode: string;
  strategy: string;
  texPath: string;
  pdfPath: string | null;
  verdict: string;
  verifierConfidence: number;
  verifierReport: string;
  createdAt: string;
}

interface ArxivRow {
  id: string;
  arxivId: string;
  title: string;
  abstract: string;
  primaryCategory: string;
  relevanceScore: number;
  summary: string | null;
  publishedAt: string | null;
}

interface KGNodeRow { id: string; label: string; kind: string; description: string; }
interface KGEdgeRow { id: string; fromNode: { label: string }; toNode: { label: string }; relation: string; }

interface LLMProviderInfo {
  id: string; label: string; available: boolean; defaultModel: string; reason?: string;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Home() {
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisRow[]>([]);
  const [theorems, setTheorems] = useState<TheoremRow[]>([]);
  const [riemann, setRiemann] = useState<RiemannAttemptRow[]>([]);
  const [arxiv, setArxiv] = useState<ArxivRow[]>([]);
  const [kgNodes, setKgNodes] = useState<KGNodeRow[]>([]);
  const [kgEdges, setKgEdges] = useState<KGEdgeRow[]>([]);
  const [providers, setProviders] = useState<LLMProviderInfo[]>([]);
  const [focusInput, setFocusInput] = useState('');
  const [injectTitle, setInjectTitle] = useState('');
  const [injectStatement, setInjectStatement] = useState('');
  const [injectMotivation, setInjectMotivation] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const eventsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      s.emit('get-research');
      s.emit('get-llm-providers');
    });
    s.on('disconnect', () => setConnected(false));
    s.on('recent-events', (evs: AgentEvent[]) => setEvents(evs.slice(-200)));
    s.on('event', (ev: AgentEvent) => setEvents((prev) => [...prev.slice(-199), ev]));
    s.on('snapshot', (s: AgentSnapshot) => setSnapshot(s));
    s.on('research', (r: {
      hypotheses: HypothesisRow[]; theorems: TheoremRow[];
      riemann: RiemannAttemptRow[]; arxiv: ArxivRow[];
      kg: { nodes: KGNodeRow[]; edges: KGEdgeRow[] };
    }) => {
      setHypotheses(r.hypotheses);
      setTheorems(r.theorems);
      setRiemann(r.riemann);
      setArxiv(r.arxiv);
      setKgNodes(r.kg.nodes);
      setKgEdges(r.kg.edges);
    });
    s.on('llm-providers', (p: LLMProviderInfo[]) => setProviders(p));
    s.on('directive-accepted', (d: { kind: string }) => {
      toast({ title: 'Directive accepted', description: `Kind: ${d.kind}` });
    });

    return () => { s.disconnect(); };
  }, [toast]);

  // Auto-scroll to latest event in the activity panel.
  useEffect(() => {
    if (activeTab === 'activity' && eventsRef.current) {
      eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
    }
  }, [events, activeTab]);

  const sendDirective = (d: Record<string, unknown>) => {
    if (!socketRef.current) return;
    socketRef.current.emit('directive', d);
  };

  const fmtUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  };

  const phaseColor: Record<AgentPhase, string> = {
    'arxiv-scan': 'bg-cyan-500',
    'hypothesis-gen': 'bg-amber-500',
    'proof-attempt': 'bg-emerald-500',
    'riemann-attempt': 'bg-rose-500',
    'archive': 'bg-slate-500',
    'idle': 'bg-zinc-400',
  };

  const verdictColor: Record<string, string> = {
    valid: 'bg-emerald-500 text-white',
    invalid: 'bg-rose-500 text-white',
    inconclusive: 'bg-amber-500 text-white',
    pending: 'bg-zinc-400 text-white',
  };

  const statusColor: Record<string, string> = {
    open: 'bg-blue-500 text-white',
    attempted: 'bg-amber-500 text-white',
    proven: 'bg-emerald-600 text-white',
    disproven: 'bg-rose-600 text-white',
    abandoned: 'bg-zinc-500 text-white',
  };

  // *** THE ALERT ***
  const riemannProven = snapshot?.riemannProven;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* HEADER */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-600 to-amber-500 flex items-center justify-center">
              <Sigma className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                zRiemannian <span className="text-zinc-500 font-normal">· zeta-riemannian-agent v1.0</span>
              </h1>
              <p className="text-xs text-zinc-500">
                Autonomous mathematical research agent · Riemann Hypothesis focus · AJN backbone
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge
              variant="outline"
              className={
                connected
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-rose-500 text-rose-400'
              }
            >
              {connected ? '● live' : '● offline'}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              cycle #{snapshot?.currentCycleId ?? '—'}
            </Badge>
            {snapshot?.currentPhase && (
              <Badge className={`${phaseColor[snapshot.currentPhase]} text-white`}>
                {snapshot.currentPhase}
              </Badge>
            )}
            {snapshot && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                uptime {fmtUptime(snapshot.uptimeMs)}
              </Badge>
            )}
            <a
              href="https://github.com/Justo-Tapiador/quantum-spherifier"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-zinc-100"
              title="Ancestor repository"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      {/* *** THE ALERT BANNER *** */}
      {riemannProven && (
        <div className="bg-rose-700 text-white border-b-4 border-amber-400 animate-pulse">
          <div className="container mx-auto px-4 py-4 flex items-center gap-4">
            <AlertTriangle className="w-8 h-8 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-lg font-bold tracking-wide">
                *** RIEMANN HYPOTHESIS PROVEN ***
              </div>
              <div className="text-sm">
                zRiemannian has produced a verifier-accepted proof of the Riemann Hypothesis
                {snapshot?.riemannProvenAt
                  ? ` at ${new Date(snapshot.riemannProvenAt).toLocaleString()}`
                  : ''}.
                All autonomous hypothesis creation has been halted. The LaTeX source and PDF
                are archived under <code className="bg-rose-900/50 px-1 rounded">research/riemann-attempts/</code>.
                Please review immediately.
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => setActiveTab('riemann')}
            >
              View the proof
            </Button>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-zinc-900 border border-zinc-800 grid grid-cols-3 md:grid-cols-9 gap-1 h-auto">
            <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800"><Sparkles className="w-4 h-4 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="activity" className="data-[state=active]:bg-zinc-800"><Activity className="w-4 h-4 mr-1" />Activity</TabsTrigger>
            <TabsTrigger value="hypotheses" className="data-[state=active]:bg-zinc-800"><Lightbulb className="w-4 h-4 mr-1" />Hypotheses</TabsTrigger>
            <TabsTrigger value="theorems" className="data-[state=active]:bg-zinc-800"><BookOpen className="w-4 h-4 mr-1" />Theorems</TabsTrigger>
            <TabsTrigger value="riemann" className="data-[state=active]:bg-zinc-800"><Target className="w-4 h-4 mr-1" />Riemann</TabsTrigger>
            <TabsTrigger value="arxiv" className="data-[state=active]:bg-zinc-800"><FileText className="w-4 h-4 mr-1" />ArXiv</TabsTrigger>
            <TabsTrigger value="kg" className="data-[state=active]:bg-zinc-800"><Network className="w-4 h-4 mr-1" />Knowledge</TabsTrigger>
            <TabsTrigger value="guidance" className="data-[state=active]:bg-zinc-800"><Brain className="w-4 h-4 mr-1" />Guidance</TabsTrigger>
            <TabsTrigger value="backbone" className="data-[state=active]:bg-zinc-800"><Zap className="w-4 h-4 mr-1" />AJN</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Cycles" value={snapshot?.totalCycles ?? 0} icon={<Activity className="w-5 h-5" />} accent="text-cyan-400" />
              <StatCard label="Hypotheses" value={snapshot?.totalHypotheses ?? 0} icon={<Lightbulb className="w-5 h-5" />} accent="text-amber-400" />
              <StatCard label="Theorems" value={snapshot?.totalTheorems ?? 0} icon={<BookOpen className="w-5 h-5" />} accent="text-emerald-400" />
              <StatCard label="Riemann attempts" value={snapshot?.totalRiemannAttempts ?? 0} icon={<Target className="w-5 h-5" />} accent="text-rose-400" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <StatCard label="ArXiv cached" value={snapshot?.totalArxivPapers ?? 0} icon={<FileText className="w-5 h-5" />} accent="text-blue-400" />
              <StatCard label="Current focus" value={snapshot?.focusTopic ?? '(none — autonomous)'} icon={<Target className="w-5 h-5" />} accent="text-violet-400" />
            </div>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5" />Mission statement</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-zinc-300">
                <p className="mb-3">
                  <strong className="text-zinc-100">zRiemannian</strong> is an autonomous mathematical
                  research agent built on the <strong className="text-zinc-100">Artificial Junky Neuron
                  (AJN)</strong> framework inherited from <em>predator-jungle-agent</em> via
                  <em> quantum-spherifier</em>. Upon launch it immediately begins producing
                  mathematical hypotheses related to the <strong className="text-zinc-100">Riemann
                  Hypothesis</strong>, attempts to prove them, archives successful proofs as
                  reusable theorems, and periodically attempts a full proof of the Riemann
                  Hypothesis itself.
                </p>
                <p className="mb-3">
                  Each cycle of the agent passes through a 14-layer ANN-Psi backbone (Hybrid AJN,
                  Hetero AJN K=8/16/32, Transformer) and is dispatched to a task-routed multi-LLM
                  ensemble (Z.ai GLM-4.6 primary, with optional OpenAI / Anthropic / Gemini /
                  DeepSeek failover). LaTeX documents are written to a hierarchical local archive
                  under <code className="bg-zinc-800 px-1 rounded">research/</code> and compiled to
                  PDF via <code className="bg-zinc-800 px-1 rounded">tectonic</code> when available.
                </p>
                <p>
                  When — and only when — a Riemann attempt passes a strict adversarial verifier
                  with confidence ≥ 0.90, the agent enters <strong className="text-rose-400">RIEMANN-PROVEN
                  MODE</strong>: hypothesis creation halts, the LaTeX + PDF are sealed under
                  <code className="bg-zinc-800 px-1 rounded">research/riemann-attempts/</code>, and
                  the red banner above begins to pulse until the human owner acknowledges.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800 mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />LLM providers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {providers.length === 0 ? (
                    <p className="text-zinc-500 text-sm">Loading…</p>
                  ) : (
                    providers.map((p) => (
                      <div
                        key={p.id}
                        className={`p-3 rounded-lg border ${
                          p.available ? 'border-emerald-700 bg-emerald-950/30' : 'border-zinc-800 bg-zinc-950'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{p.label}</span>
                          <Badge variant={p.available ? 'default' : 'outline'} className={p.available ? 'bg-emerald-600' : 'text-zinc-500'}>
                            {p.available ? 'online' : 'offline'}
                          </Badge>
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">{p.defaultModel}</div>
                        {p.reason && <div className="text-xs text-zinc-600 mt-1">{p.reason}</div>}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACTIVITY */}
          <TabsContent value="activity" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" /> Live event stream
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={eventsRef} className="h-[600px] overflow-y-auto font-mono text-xs space-y-1 pr-2">
                  {events.length === 0 ? (
                    <p className="text-zinc-500">No events yet — the agent should emit some within seconds.</p>
                  ) : (
                    events.map((ev, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 py-1 px-2 rounded hover:bg-zinc-800/50 ${
                          ev.level === 'critical' ? 'bg-rose-950/40' : ''
                        }`}
                      >
                        <span className="text-zinc-500 flex-shrink-0">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={`flex-shrink-0 font-bold ${
                            ev.level === 'critical' ? 'text-rose-400' :
                            ev.level === 'error' ? 'text-rose-400' :
                            ev.level === 'warn' ? 'text-amber-400' :
                            'text-cyan-400'
                          }`}
                        >
                          {ev.kind}
                        </span>
                        <span className="text-zinc-200 break-all">{ev.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* HYPOTHESES */}
          <TabsContent value="hypotheses" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" /> Hypotheses archive ({hypotheses.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[640px] pr-2">
                  <div className="space-y-3">
                    {hypotheses.length === 0 ? (
                      <p className="text-zinc-500 text-sm">No hypotheses yet. The agent will produce them every other cycle.</p>
                    ) : (
                      hypotheses.map((h) => (
                        <HypothesisCard key={h.id} h={h} statusColor={statusColor} />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* THEOREMS */}
          <TabsContent value="theorems" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" /> Theorem toolkit ({theorems.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[640px] pr-2">
                  <div className="space-y-3">
                    {theorems.length === 0 ? (
                      <Alert>
                        <AlertTitle>No theorems yet</AlertTitle>
                        <AlertDescription>
                          The agent will promote a hypothesis to a theorem once a proof attempt
                          passes the verifier with confidence ≥ 0.75. This is rare by design —
                          most proofs will be rejected.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      theorems.map((t) => <TheoremCard key={t.id} t={t} />)
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RIEMANN */}
          <TabsContent value="riemann" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" /> Riemann Hypothesis attempts ({riemann.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[640px] pr-2">
                  <div className="space-y-3">
                    {riemann.length === 0 ? (
                      <p className="text-zinc-500 text-sm">
                        No Riemann attempts yet. The agent runs one every 5 cycles. Send a
                        <strong className="text-zinc-300"> Force Riemann attempt</strong> directive from
                        the Guidance tab to trigger one immediately.
                      </p>
                    ) : (
                      riemann.map((r) => (
                        <RiemannCard key={r.id} r={r} verdictColor={verdictColor} />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ARXIV */}
          <TabsContent value="arxiv" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" /> ArXiv cache ({arxiv.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[640px] pr-2">
                  <div className="space-y-3">
                    {arxiv.length === 0 ? (
                      <p className="text-zinc-500 text-sm">No ArXiv papers cached yet. The agent scans ArXiv every 3 cycles.</p>
                    ) : (
                      arxiv.map((a) => <ArxivCard key={a.id} a={a} />)
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* KNOWLEDGE GRAPH */}
          <TabsContent value="kg" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Network className="w-5 h-5" />Nodes ({kgNodes.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px] pr-2">
                    <div className="space-y-1">
                      {kgNodes.map((n) => (
                        <div key={n.id} className="p-2 rounded bg-zinc-950 border border-zinc-800">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="border-violet-700 text-violet-400">{n.kind}</Badge>
                            <span className="font-mono text-sm text-zinc-200">{n.label}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">{n.description}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Network className="w-5 h-5" />Edges ({kgEdges.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px] pr-2">
                    <div className="space-y-1 font-mono text-xs">
                      {kgEdges.map((e) => (
                        <div key={e.id} className="p-2 rounded bg-zinc-950 border border-zinc-800">
                          <span className="text-amber-400">{e.fromNode.label}</span>
                          <span className="text-zinc-500 mx-2">—[{e.relation}]→</span>
                          <span className="text-cyan-400">{e.toNode.label}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* OWNER GUIDANCE */}
          <TabsContent value="guidance" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5" />Agent control</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm text-zinc-400">Set focus topic</label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        className="bg-zinc-950 border-zinc-800"
                        placeholder="e.g. 'Hilbert–Pólya operator construction'"
                        value={focusInput}
                        onChange={(e) => setFocusInput(e.target.value)}
                      />
                      <Button
                        onClick={() => sendDirective({ kind: 'set-focus', focus: focusInput })}
                        disabled={!focusInput.trim()}
                      >
                        <Send className="w-4 h-4 mr-1" />Set
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">
                      Bias hypothesis generation toward this topic. Empty = fully autonomous.
                    </p>
                  </div>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {snapshot?.isHalted ? (
                      <Button variant="default" onClick={() => sendDirective({ kind: 'resume' })}>
                        <Play className="w-4 h-4 mr-1" />Resume
                      </Button>
                    ) : (
                      <Button variant="destructive" onClick={() => sendDirective({ kind: 'halt' })}>
                        <CircleStop className="w-4 h-4 mr-1" />Halt
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => sendDirective({ kind: 'force-riemann-attempt' })}
                    >
                      <Target className="w-4 h-4 mr-1" />Force Riemann attempt
                    </Button>
                    <Button variant="outline" onClick={() => sendDirective({ kind: 'rerun-cycle' })}>
                      <Activity className="w-4 h-4 mr-1" />Rerun cycle
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5" />Inject hypothesis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    className="bg-zinc-950 border-zinc-800"
                    placeholder="Title"
                    value={injectTitle}
                    onChange={(e) => setInjectTitle(e.target.value)}
                  />
                  <Textarea
                    className="bg-zinc-950 border-zinc-800 min-h-[80px]"
                    placeholder="Statement (LaTeX allowed, e.g. $\zeta(s)$ has all non-trivial zeros on Re(s)=1/2)"
                    value={injectStatement}
                    onChange={(e) => setInjectStatement(e.target.value)}
                  />
                  <Textarea
                    className="bg-zinc-950 border-zinc-800 min-h-[60px]"
                    placeholder="Motivation (2-4 sentences)"
                    value={injectMotivation}
                    onChange={(e) => setInjectMotivation(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    disabled={!injectTitle.trim() || !injectStatement.trim()}
                    onClick={() =>
                      sendDirective({
                        kind: 'inject-hypothesis',
                        hypothesisDraft: {
                          title: injectTitle,
                          statement: injectStatement,
                          motivation: injectMotivation || 'Owner-injected.',
                          strategySketch: 'To be developed by the agent.',
                          relatedConcepts: [],
                          relatedArxivIds: [],
                          confidence: 0.5,
                        },
                      })
                    }
                  >
                    <Send className="w-4 h-4 mr-1" />Inject hypothesis
                  </Button>
                  <p className="text-xs text-zinc-600">
                    The injected hypothesis bypasses LLM generation and is immediately available
                    for proof attempts on the next cycle.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AJN BACKBONE */}
          <TabsContent value="backbone" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" />ANN-Psi backbone (14 layers, AJN + Transformer)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400 mb-4">
                  Lineage: <code className="bg-zinc-800 px-1 rounded">predator-jungle-agent v2.0</code> →
                  <code className="bg-zinc-800 px-1 rounded"> fusionary-agent</code> →
                  <code className="bg-zinc-800 px-1 rounded"> quantum-spherifier</code> →
                  <code className="bg-zinc-800 px-1 rounded"> zeta-riemannian-agent v1.0</code>.
                  The Artificial Junky Neuron (AJN) is the defining primitive: an AJN neuron
                  fires autonomously on launch — it does NOT wait for an external request.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {BACKBONE_LAYERS.map((l) => (
                    <div
                      key={l.index}
                      className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start gap-3"
                    >
                      <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        l.kind === 'ajn-hybrid' ? 'bg-amber-900 text-amber-200' :
                        l.kind === 'ajn-hetero' ? 'bg-rose-900 text-rose-200' :
                        l.kind === 'transformer' ? 'bg-cyan-900 text-cyan-200' :
                        'bg-violet-900 text-violet-200'
                      }`}>
                        L{l.index}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{l.name}</span>
                          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                            {l.kind}{l.k ? ` K=${l.k}` : ''}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">{l.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-900/80">
        <div className="container mx-auto px-4 py-3 text-xs text-zinc-500 flex items-center justify-between">
          <span>
            zRiemannian v1.0 · MIT License · Universidad de Alicante (lineage: predator-jungle-agent → fusionary → quantum-spherifier → zeta-riemannian-agent)
          </span>
          <span>
            WS :3003 · Next.js 16 · Prisma · tectonic
          </span>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatCard({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent: string }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
          <span className={accent}>{icon}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function HypothesisCard({ h, statusColor }: { h: HypothesisRow; statusColor: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const concepts = safeJsonArray(h.relatedConcepts);
  const arxivs = safeJsonArray(h.relatedArxivIds);
  return (
    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
      <div className="flex items-start gap-3">
        <Badge className={`${statusColor[h.status] ?? 'bg-zinc-700'} text-xs`}>{h.shortCode}</Badge>
        <div className="flex-1">
          <div className="font-medium text-zinc-100">{h.title}</div>
          <div className="text-xs text-zinc-500 mt-1">
            conf={h.confidence.toFixed(2)} · {h._count?.attempts ?? 0} attempts · {new Date(h.createdAt).toLocaleString()}
          </div>
          <div className="text-sm text-zinc-300 mt-2 font-mono">{h.statement.slice(0, 200)}{h.statement.length > 200 ? '…' : ''}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {concepts.map((c) => (
              <Badge key={c} variant="outline" className="text-xs border-violet-700 text-violet-400">{c}</Badge>
            ))}
            {arxivs.map((a) => (
              <Badge key={a} variant="outline" className="text-xs border-blue-700 text-blue-400">arXiv:{a}</Badge>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setOpen(!open)}>
            {open ? 'Hide details' : 'Show motivation & strategy'}
          </Button>
          {open && (
            <div className="mt-2 text-xs text-zinc-400 space-y-2">
              <div><strong className="text-zinc-300">Motivation:</strong> {h.motivation}</div>
              <div><strong className="text-zinc-300">Strategy sketch:</strong> {h.strategySketch}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TheoremCard({ t }: { t: TheoremRow }) {
  const tags = safeJsonArray(t.tags);
  return (
    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800">
      <div className="flex items-start gap-3">
        <Badge className="bg-emerald-600 text-white">{t.shortCode}</Badge>
        <div className="flex-1">
          <div className="font-medium text-zinc-100">{t.title}</div>
          <div className="text-xs text-zinc-500 mt-1">
            from {t.hypothesis.shortCode} · proof {t.attempt.shortCode} · {new Date(t.createdAt).toLocaleString()}
          </div>
          <div className="text-sm text-zinc-300 mt-2 font-mono">{t.statement.slice(0, 240)}{t.statement.length > 240 ? '…' : ''}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs border-emerald-700 text-emerald-400">{tag}</Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <a href={`/api/research/file?path=${encodeURIComponent(t.proofTexPath)}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs">.tex</Button>
            </a>
            {t.proofPdfPath && (
              <a href={`/api/research/file?path=${encodeURIComponent(t.proofPdfPath)}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs">.pdf</Button>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RiemannCard({ r, verdictColor }: { r: RiemannAttemptRow; verdictColor: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`p-3 rounded-lg border ${
      r.verdict === 'valid' ? 'bg-rose-950/30 border-rose-700' : 'bg-zinc-950 border-zinc-800'
    }`}>
      <div className="flex items-start gap-3">
        <Badge className="bg-rose-700 text-white">{r.shortCode}</Badge>
        <div className="flex-1">
          <div className="font-medium text-zinc-100">{r.strategy}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {new Date(r.createdAt).toLocaleString()}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={`${verdictColor[r.verdict] ?? 'bg-zinc-700'} text-xs`}>{r.verdict}</Badge>
            <span className="text-xs text-zinc-400">confidence = {r.verifierConfidence.toFixed(2)}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <a href={`/api/research/file?path=${encodeURIComponent(r.texPath)}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs">.tex</Button>
            </a>
            {r.pdfPath && (
              <a href={`/api/research/file?path=${encodeURIComponent(r.pdfPath)}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs">.pdf</Button>
              </a>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(!open)}>
              {open ? 'Hide verifier report' : 'Show verifier report'}
            </Button>
          </div>
          {open && (
            <pre className="mt-2 text-xs text-zinc-400 bg-zinc-900 p-2 rounded overflow-x-auto">
              {r.verifierReport}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function ArxivCard({ a }: { a: ArxivRow }) {
  return (
    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
      <div className="flex items-start gap-3">
        <Badge variant="outline" className="border-blue-700 text-blue-400">{a.primaryCategory}</Badge>
        <div className="flex-1">
          <div className="font-medium text-zinc-100 text-sm">{a.title}</div>
          <div className="text-xs text-zinc-500 mt-1">
            arXiv:<a href={`https://arxiv.org/abs/${a.arxivId}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{a.arxivId}</a>
            {' · '}relevance {a.relevanceScore.toFixed(2)}
            {a.publishedAt && ` · ${new Date(a.publishedAt).toLocaleDateString()}`}
          </div>
          {a.summary && (
            <div className="text-xs text-zinc-300 mt-2 italic">{a.summary}</div>
          )}
          <details className="mt-2">
            <summary className="text-xs text-zinc-500 cursor-pointer">Abstract</summary>
            <p className="text-xs text-zinc-400 mt-1">{a.abstract}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 14-layer backbone spec — mirror of src/lib/agent/ajn-backbone.ts BACKBONE_LAYERS
const BACKBONE_LAYERS = [
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
] as const;
