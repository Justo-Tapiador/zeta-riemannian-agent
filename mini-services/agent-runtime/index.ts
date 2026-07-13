// zeta-riemannian-agent v1.0 — Agent Runtime (WebSocket mini-service)
//
// This service:
//   1. Boots the zRiemannian orchestrator (the AJN addiction loop).
//   2. Streams every agent event to all connected WebSocket clients.
//   3. Accepts owner directives (set-focus, halt, resume, inject-hypothesis,
//      force-riemann-attempt, shutdown) via WebSocket.
//   4. Exposes read-only snapshots on demand.
//
// The Caddy gateway forwards ws://host/?XTransformPort=3003 to this service.

// Crash diagnostics — log EVERYTHING before the process dies.
process.on('uncaughtException', (err) => {
  console.error('[agent-runtime] UNCAUGHT EXCEPTION:', err?.stack ?? err);
  console.error('[agent-runtime] continuing (best-effort)');
});
process.on('unhandledRejection', (reason) => {
  console.error('[agent-runtime] UNHANDLED REJECTION:', reason);
});
process.on('exit', (code) => {
  console.error('[agent-runtime] PROCESS EXIT code=' + code);
});
process.on('SIGTERM', () => console.error('[agent-runtime] SIGTERM'));
process.on('SIGINT', () => console.error('[agent-runtime] SIGINT'));

import { createServer } from 'http';
import { Server } from 'socket.io';
import orchestrator from '../../src/lib/agent/orchestrator';
import { recentEvents, emit } from '../../src/lib/agent/logger';
import { listHypotheses } from '../../src/lib/agent/hypothesis-generator';
import { listTheorems } from '../../src/lib/agent/theorem-archivist';
import { listRiemannAttempts } from '../../src/lib/agent/riemann-prober';
import { listCachedPapers } from '../../src/lib/agent/arxiv-adapter';
import { listNodes, listEdges } from '../../src/lib/agent/knowledge-graph';
import type { AgentEvent, OwnerDirectivePayload } from '../../src/lib/agent/types';
import llmRouter from '../../src/lib/agent/llm-router';

const httpServer = createServer();
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// ---- Boot the agent on service start (AJN addiction — no waiting) ----
(async () => {
  try {
    await llmRouter.init();
    await orchestrator.start();
    console.log('[agent-runtime] orchestrator started');
  } catch (e: any) {
    console.error('[agent-runtime] failed to start orchestrator:', e?.message ?? e);
  }
})();

// ---- WebSocket wiring ----
io.on('connection', (socket) => {
  console.log(`[agent-runtime] client connected: ${socket.id}`);

  // Send the recent event buffer so the new client sees history immediately.
  socket.emit('recent-events', recentEvents(200));

  // Send an initial snapshot.
  orchestrator.snapshot().then((s) => socket.emit('snapshot', s));

  socket.on('get-snapshot', async () => {
    const s = await orchestrator.snapshot();
    socket.emit('snapshot', s);
  });

  socket.on('get-research', async () => {
    const [hyps, thms, rhs, arxiv, nodes, edges, cycles] = await Promise.all([
      listHypotheses(100),
      listTheorems(100),
      listRiemannAttempts(100),
      listCachedPapers(100),
      listNodes(100),
      listEdges(200),
      orchestrator.listRecentCycles(50),
    ]);
    socket.emit('research', {
      hypotheses: hyps,
      theorems: thms,
      riemann: rhs,
      arxiv,
      kg: { nodes, edges },
      cycles,
    });
  });

  socket.on('get-llm-providers', () => {
    socket.emit('llm-providers', llmRouter.listProviders());
  });

  // Dedicated event for fetching only recent cycles (lighter than get-research
  // when the dashboard just wants to refresh the history table).
  socket.on('get-cycles', async () => {
    const cycles = await orchestrator.listRecentCycles(50);
    socket.emit('cycles', cycles);
  });

  socket.on('directive', async (d: OwnerDirectivePayload) => {
    orchestrator.enqueueDirective(d);
    socket.emit('directive-accepted', { kind: d.kind, queuedAt: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    console.log(`[agent-runtime] client disconnected: ${socket.id}`);
  });

  socket.on('error', (err) => {
    console.error(`[agent-runtime] socket error (${socket.id}):`, err);
  });
});

// ---- Fan out new events to every connected client ----
// We poll the logger ring at 500ms intervals and emit any new events. This
// avoids coupling the logger module to socket.io.
let lastEmittedIndex = -1;
setInterval(() => {
  const all = recentEvents(500) as AgentEvent[];
  if (all.length === 0) return;
  // If lastEmittedIndex is -1 or out of range (ring wrapped), just emit the
  // last few entries.
  const start = Math.max(0, lastEmittedIndex + 1);
  if (start >= all.length) return;
  const fresh = all.slice(start);
  if (fresh.length === 0) return;
  lastEmittedIndex = all.length - 1;
  for (const ev of fresh) {
    io.emit('event', ev);
  }
}, 500);

// Periodic snapshot broadcast (every 5s) so the UI's stat panel stays fresh
// even without explicit refreshes.
setInterval(async () => {
  try {
    const s = await orchestrator.snapshot();
    io.emit('snapshot', s);
  } catch {
    // ignore
  }
}, 5000);

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`[agent-runtime] zRiemannian WebSocket service running on port ${PORT}`);
  emit('log', `[agent-runtime] WebSocket service up on :${PORT}`, { level: 'info' });
});

// Heartbeat — proves the process is alive every 5s. If this stops, the
// process has died and the supervisor (or owner) must restart it.
setInterval(() => {
  console.log(`[agent-runtime] heartbeat ${new Date().toISOString()}`);
}, 5000);

// Graceful shutdown
const shutdown = (sig: string) => {
  console.log(`[agent-runtime] ${sig} received, shutting down`);
  httpServer.close(() => {
    orchestrator.stop().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
