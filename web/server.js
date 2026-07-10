// zeta-riemannian-agent v1.0 — Native Node.js web server
// =================================================================
// Replaces the Next.js dashboard with a single-file HTTP server that:
//   1. Serves static files from web/public/ (index.html, css, js, images)
//   2. Boots the zRiemannian orchestrator (AJN addiction loop)
//   3. Streams every agent event to connected WebSocket clients
//   4. Accepts owner directives via WebSocket
//   5. Serves LaTeX/PDF artifacts from research/ via /api/research/file
//
// Usage:
//   node web/server.js
//
// Then open http://localhost:3000 in your browser.
//
// No Next.js, no React, no build step. Plain HTML + vanilla JS + CSS.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { createReadStream } = require('fs');
const { Server: SocketIOServer } = require('socket.io');

// ---------------------------------------------------------------------------
// Project root discovery — walk up until we find package.json + prisma/
// ---------------------------------------------------------------------------
function findProjectRoot() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'prisma'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const WEB_PUBLIC = path.join(__dirname, 'public');
const RESEARCH_ROOT = path.join(PROJECT_ROOT, 'research');

console.log('[zRiemannian web/server.js] project root:', PROJECT_ROOT);
console.log('[zRiemannian web/server.js] serving static from:', WEB_PUBLIC);
console.log('[zRiemannian web/server.js] research archive at:', RESEARCH_ROOT);

// ---------------------------------------------------------------------------
// Load the agent modules (CommonJS-friendly requires of the TS source via bun)
// ---------------------------------------------------------------------------
// We use dynamic require with ts-node-less fallback. The simplest path is to
// require the compiled JS if present, or use bun to run this file. Since the
// project ships with bun, we use the TypeScript source directly.

let db, orchestrator, recentEvents, emit, listHypotheses, listTheorems,
    listRiemannAttempts, listCachedPapers, listNodes, listEdges, llmRouter;

try {
  // Try to load from src/lib/agent/* — works under bun (TS native) or
  // after a TS compile step.
  const libPath = path.join(PROJECT_ROOT, 'src', 'lib');
  db = require(path.join(libPath, 'db'));
  orchestrator = require(path.join(libPath, 'agent', 'orchestrator')).default;
  const loggerMod = require(path.join(libPath, 'agent', 'logger'));
  recentEvents = loggerMod.recentEvents;
  emit = loggerMod.emit;
  listHypotheses = require(path.join(libPath, 'agent', 'hypothesis-generator')).listHypotheses;
  listTheorems = require(path.join(libPath, 'agent', 'theorem-archivist')).listTheorems;
  listRiemannAttempts = require(path.join(libPath, 'agent', 'riemann-prober')).listRiemannAttempts;
  listCachedPapers = require(path.join(libPath, 'agent', 'arxiv-adapter')).listCachedPapers;
  const kgMod = require(path.join(libPath, 'agent', 'knowledge-graph'));
  listNodes = kgMod.listNodes;
  listEdges = kgMod.listEdges;
  llmRouter = require(path.join(libPath, 'agent', 'llm-router')).default;
  console.log('[zRiemannian web/server.js] agent modules loaded');
} catch (e) {
  console.error('[zRiemannian web/server.js] FAILED to load agent modules:', e.message);
  console.error('[zRiemannian web/server.js] The web server will run but the agent will NOT be active.');
  console.error('[zRiemannian web/server.js] Make sure you run this with: bun web/server.js');
  console.error('[zRiemannian web/server.js] (bun loads TypeScript natively; plain node does not.)');
}

// ---------------------------------------------------------------------------
// Static file MIME types
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.tex': 'application/x-tex',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
};

// ---------------------------------------------------------------------------
// HTTP request handler — static files + /api/research/file
// ---------------------------------------------------------------------------
const httpServer = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  // CORS headers (helpful if you serve the agent on a different host)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API: /api/research/file?path=... ---
  if (pathname === '/api/research/file') {
    const relPath = parsed.query.path;
    if (!relPath || typeof relPath !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing path' }));
      return;
    }
    const abs = path.resolve(RESEARCH_ROOT, relPath);
    if (!abs.startsWith(RESEARCH_ROOT + path.sep) && abs !== RESEARCH_ROOT) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stream = createReadStream(abs);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(abs)}"`,
      'Cache-Control': 'no-store',
    });
    stream.pipe(res);
    return;
  }

  // --- API: /api/snapshot ---
  if (pathname === '/api/snapshot' && orchestrator) {
    try {
      const snap = await orchestrator.snapshot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snap));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- Static files from web/public/ ---
  let filePath = path.join(WEB_PUBLIC, pathname);
  if (pathname === '/' || pathname === '') {
    filePath = path.join(WEB_PUBLIC, 'index.html');
  }

  // Security: prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(WEB_PUBLIC + path.sep) && resolved !== WEB_PUBLIC) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><head><title>404</title></head><body><h1>404 — Not Found</h1><p>' + pathname + '</p></body></html>');
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stream = createReadStream(resolved);
  stream.on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  stream.pipe(res);
});

// ---------------------------------------------------------------------------
// Socket.io server — streams agent events to the browser
// ---------------------------------------------------------------------------
// IMPORTANT: socket.io path is set to /socket.io/ (the default) so it does
// NOT intercept regular HTTP requests for static files. The browser client
// loads /socket.io/socket.io.js (served automatically by socket.io) and
// connects to the same origin.
const io = new SocketIOServer(httpServer, {
  path: '/socket.io/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// Boot the agent on server start (AJN addiction — no waiting)
(async () => {
  if (!orchestrator) {
    console.error('[zRiemannian web/server.js] orchestrator not available — skipping agent boot');
    return;
  }
  try {
    if (llmRouter && typeof llmRouter.init === 'function') {
      await llmRouter.init();
    }
    await orchestrator.start();
    console.log('[zRiemannian web/server.js] orchestrator started — AJN addiction engaged');
  } catch (e) {
    console.error('[zRiemannian web/server.js] failed to start orchestrator:', e?.message ?? e);
  }
})();

// WebSocket connection handler
io.on('connection', async (socket) => {
  console.log(`[zRiemannian web/server.js] client connected: ${socket.id}`);

  // Send recent events buffer so new client sees history
  if (recentEvents) {
    socket.emit('recent-events', recentEvents(200));
  }

  // Send initial snapshot
  if (orchestrator) {
    try {
      const snap = await orchestrator.snapshot();
      socket.emit('snapshot', snap);
    } catch (e) {
      console.error('[zRiemannian web/server.js] snapshot error:', e.message);
    }
  }

  socket.on('get-snapshot', async () => {
    if (!orchestrator) return;
    try {
      const snap = await orchestrator.snapshot();
      socket.emit('snapshot', snap);
    } catch (e) {
      console.error('[zRiemannian web/server.js] get-snapshot error:', e.message);
    }
  });

  socket.on('get-research', async () => {
    if (!listHypotheses) return;
    try {
      const [hyps, thms, rhs, arxiv, nodes, edges] = await Promise.all([
        listHypotheses(100),
        listTheorems(100),
        listRiemannAttempts(100),
        listCachedPapers(100),
        listNodes(100),
        listEdges(200),
      ]);
      socket.emit('research', { hypotheses: hyps, theorems: thms, riemann: rhs, arxiv, kg: { nodes, edges } });
    } catch (e) {
      console.error('[zRiemannian web/server.js] get-research error:', e.message);
    }
  });

  socket.on('get-llm-providers', () => {
    if (llmRouter) {
      socket.emit('llm-providers', llmRouter.listProviders());
    }
  });

  socket.on('directive', (d) => {
    if (orchestrator) {
      orchestrator.enqueueDirective(d);
      socket.emit('directive-accepted', { kind: d.kind, queuedAt: new Date().toISOString() });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[zRiemannian web/server.js] client disconnected: ${socket.id}`);
  });

  socket.on('error', (err) => {
    console.error(`[zRiemannian web/server.js] socket error (${socket.id}):`, err);
  });
});

// Fan out new logger events to every connected client
let lastEmittedIndex = -1;
setInterval(() => {
  if (!recentEvents) return;
  const all = recentEvents(500);
  if (all.length === 0) return;
  const start = Math.max(0, lastEmittedIndex + 1);
  if (start >= all.length) return;
  const fresh = all.slice(start);
  if (fresh.length === 0) return;
  lastEmittedIndex = all.length - 1;
  for (const ev of fresh) {
    io.emit('event', ev);
  }
}, 500);

// Periodic snapshot broadcast (every 5s) so the UI stats stay fresh
setInterval(async () => {
  if (!orchestrator) return;
  try {
    const s = await orchestrator.snapshot();
    io.emit('snapshot', s);
  } catch (e) {
    // ignore
  }
}, 5000);

// ---------------------------------------------------------------------------
// Heartbeat (5s) — proves the process is alive
// ---------------------------------------------------------------------------
setInterval(() => {
  console.log(`[zRiemannian web/server.js] heartbeat ${new Date().toISOString()}`);
}, 5000);

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('========================================================');
  console.log(`  zRiemannian web server running on port ${PORT}`);
  console.log(`  Open http://localhost:${PORT} in your browser`);
  console.log('========================================================');
  if (emit) {
    emit('log', `[web/server.js] up on :${PORT}`, { level: 'info' });
  }
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = (sig) => {
  console.log(`[zRiemannian web/server.js] ${sig} received, shutting down`);
  httpServer.close(() => {
    if (orchestrator && typeof orchestrator.stop === 'function') {
      orchestrator.stop().finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Crash diagnostics
process.on('uncaughtException', (err) => {
  console.error('[zRiemannian web/server.js] UNCAUGHT EXCEPTION:', err?.stack ?? err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[zRiemannian web/server.js] UNHANDLED REJECTION:', reason);
});
process.on('exit', (code) => {
  console.error('[zRiemannian web/server.js] PROCESS EXIT code=' + code);
});
