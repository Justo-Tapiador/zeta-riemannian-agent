// zeta-riemannian-agent v1.0 — web/public/js/app.js
// Plain vanilla JavaScript. No React, no framework. Just the DOM + Socket.io.

(function () {
  'use strict';

  // -------- State --------
  var socket = null;
  var connected = false;
  var snapshot = null;
  var events = [];
  var research = { hypotheses: [], theorems: [], riemann: [], arxiv: [], kg: { nodes: [], edges: [] } };
  var providers = [];
  var cycles = [];

  // -------- Constants --------
  var BACKBONE_LAYERS = [
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
    { index: 14, name: 'Emit',      kind: 'output',      role: 'Final emission: doc / event / alert' }
  ];

  // -------- Helpers --------
  function $(id) { return document.getElementById(id); }
  // Public DOM helper — exposed on window for inline event handlers and
  // future extensions. Currently the dashboard builds DOM via innerHTML
  // templates, but el() is kept as a stable utility API.
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          e.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
        } else if (k === 'href' || k === 'src' || k === 'target' || k === 'style') {
          e.setAttribute(k, attrs[k]);
        } else {
          e[k] = attrs[k];
        }
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      });
    }
    return e;
  }
  function safeJsonArray(s) {
    try { var v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (_e) { return []; }
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUptime(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h + 'h ' + m + 'm ' + sec + 's';
  }
  function showToast(title, desc) {
    $('toast-title').textContent = title;
    $('toast-desc').textContent = desc || '';
    $('toast').classList.add('show');
    setTimeout(function () { $('toast').classList.remove('show'); }, 3500);
  }
  window.showToast = showToast;

  // -------- Tab switching --------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    var tabBtn = document.querySelector('.tab[data-tab="' + name + '"]');
    var panel = $('tab-' + name);
    if (tabBtn) tabBtn.classList.add('active');
    if (panel) panel.classList.add('active');
    if (name === 'activity') {
      var feed = $('activity-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    }
  }
  window.switchTab = switchTab;

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchTab(t.dataset.tab); });
  });

  // -------- Connect WebSocket --------
  function connect() {
    // Connect to the same origin (the web/server.js hosts both HTTP and WS)
    socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 10 });

    socket.on('connect', function () {
      connected = true;
      $('conn-badge').textContent = '● live';
      $('conn-badge').className = 'badge live';
      socket.emit('get-research');
      socket.emit('get-llm-providers');
    });

    socket.on('disconnect', function () {
      connected = false;
      $('conn-badge').textContent = '● offline';
      $('conn-badge').className = 'badge offline';
    });

    socket.on('recent-events', function (evs) {
      events = evs.slice(-200);
      renderActivity();
    });

    socket.on('event', function (ev) {
      events.push(ev);
      if (events.length > 200) events = events.slice(-200);
      renderActivity();
      // When a cycle ends, refresh the cycles table so the new row appears
      // with its LLM provider/model info.
      if (ev.kind === 'cycle-end' && socket) {
        socket.emit('get-cycles');
      }
    });

    socket.on('snapshot', function (s) {
      snapshot = s;
      renderSnapshot();
    });

    socket.on('research', function (r) {
      research = r;
      renderHypotheses();
      renderTheorems();
      renderRiemann();
      renderArxiv();
      renderKG();
      // r.cycles may be undefined when talking to an older server.
      if (r.cycles) {
        cycles = r.cycles;
        renderCycles();
      }
    });

    // Dedicated cycles event (lighter refresh than get-research).
    socket.on('cycles', function (c) {
      cycles = c;
      renderCycles();
    });

    socket.on('llm-providers', function (p) {
      providers = p;
      renderProviders();
    });

    socket.on('directive-accepted', function (d) {
      showToast('Directive accepted', 'Kind: ' + d.kind);
    });

    // PATCH: surface directive rejections so the user knows immediately
    // when a button click failed. Without this, an unknown kind or a
    // thrown error in the orchestrator would silently disappear.
    socket.on('directive-rejected', function (r) {
      showToast('Directive REJECTED', 'kind=' + r.kind + ' · ' + (r.reason || 'no reason'));
      console.warn('[zRiemannian] directive rejected:', r);
    });
  }

  // -------- Rendering --------
  function renderSnapshot() {
    if (!snapshot) return;
    $('cycle-badge').textContent = 'cycle #' + (snapshot.currentCycleId || '—');
    var phase = snapshot.currentPhase || 'idle';
    $('phase-badge').textContent = phase;
    $('phase-badge').className = 'badge phase-' + phase;
    $('uptime-badge').textContent = 'uptime ' + fmtUptime(snapshot.uptimeMs || 0);
    $('stat-cycles').textContent = snapshot.totalCycles || 0;
    $('stat-hypotheses').textContent = snapshot.totalHypotheses || 0;
    $('stat-theorems').textContent = snapshot.totalTheorems || 0;
    $('stat-riemann').textContent = snapshot.totalRiemannAttempts || 0;
    $('stat-arxiv').textContent = snapshot.totalArxivPapers || 0;
    $('stat-focus').textContent = snapshot.focusTopic || '(none — autonomous)';

    // Reflect priority + forced-phase overrides in the Guidance tab badges.
    // (Snapshot may come from an older orchestrator that didn't expose these
    // fields — guard with hasOwnProperty so the UI doesn't break.)
    var priority = (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'priorityLevel'))
      ? snapshot.priorityLevel : 'normal';
    var priorityBadge = $('priority-current');
    if (priorityBadge) {
      priorityBadge.textContent = priority;
      priorityBadge.className = 'badge-mini priority-' + priority;
    }
    var prioritySel = $('priority-select');
    if (prioritySel && prioritySel.value !== priority) {
      prioritySel.value = priority;
    }

    var forced = (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'forcedPhase'))
      ? snapshot.forcedPhase : null;
    var forcedBadge = $('forced-phase-current');
    if (forcedBadge) {
      forcedBadge.textContent = forced || 'none';
      forcedBadge.className = 'badge-mini' + (forced ? ' active' : '');
    }

    // Riemann alert banner
    if (snapshot.riemannProven) {
      $('riemann-alert').style.display = 'flex';
      var when = snapshot.riemannProvenAt ? new Date(snapshot.riemannProvenAt).toLocaleString() : '';
      $('alert-body').innerHTML =
        'zRiemannian has produced a verifier-accepted proof of the Riemann Hypothesis' +
        (when ? ' at ' + when : '') +
        '. All autonomous hypothesis creation has been halted. The LaTeX source and PDF ' +
        'are archived under <code>research/riemann-attempts/</code>. Please review immediately.';
    } else {
      $('riemann-alert').style.display = 'none';
    }

    // Halt/Resume button visibility
    if (snapshot.isHalted) {
      $('halt-btn').style.display = 'none';
      $('resume-btn').style.display = 'inline-flex';
    } else {
      $('halt-btn').style.display = 'inline-flex';
      $('resume-btn').style.display = 'none';
    }
  }

  function renderActivity() {
    var feed = $('activity-feed');
    if (!feed) return;
    if (events.length === 0) {
      feed.innerHTML = '<p class="text-dim">No events yet — the agent should emit some within seconds.</p>';
      return;
    }
    var html = '';
    events.forEach(function (ev) {
      var cls = 'event-row';
      if (ev.level === 'critical' || ev.kind === 'riemann-proven') cls += ' critical';
      var kindCls = 'event-kind ' + (ev.level === 'warn' ? 'warn' : ev.level === 'error' || ev.level === 'critical' ? 'error' : ev.kind);
      var time = new Date(ev.timestamp).toLocaleTimeString();
      html += '<div class="' + cls + '">' +
        '<span class="event-time">' + escapeHtml(time) + '</span>' +
        '<span class="' + kindCls + '">' + escapeHtml(ev.kind) + '</span>' +
        '<span class="event-msg">' + escapeHtml(ev.message) + '</span>' +
        '</div>';
    });
    feed.innerHTML = html;
    feed.scrollTop = feed.scrollHeight;
  }

  function renderCycles() {
    var wrap = $('cycles-table-wrap');
    if (!wrap) return;
    if (!cycles || cycles.length === 0) {
      wrap.innerHTML = '<p class="text-dim">No cycles yet.</p>';
      return;
    }
    var html = '<table class="cycles-table">';
    html += '<thead><tr>' +
      '<th>#</th>' +
      '<th>Phase</th>' +
      '<th>Status</th>' +
      '<th>Provider</th>' +
      '<th>Model</th>' +
      '<th>LLM calls</th>' +
      '<th>Tokens (in/out)</th>' +
      '<th>Started</th>' +
      '<th>Duration</th>' +
      '</tr></thead><tbody>';
    cycles.forEach(function (c) {
      var started = c.startedAt ? new Date(c.startedAt) : null;
      var ended = c.endedAt ? new Date(c.endedAt) : null;
      var durMs = (started && ended) ? (ended.getTime() - started.getTime()) : null;
      var durStr = durMs !== null ? (durMs < 1000 ? durMs + 'ms' : (durMs / 1000).toFixed(1) + 's') : '—';
      var startedStr = started ? started.toLocaleTimeString() : '—';

      var providerBadge = c.llmProvider
        ? '<span class="badge-mini provider-' + escapeHtml(c.llmProvider) + '">' + escapeHtml(c.llmProvider) + '</span>'
        : '<span class="text-dim">—</span>';
      var modelStr = c.llmModel ? '<code>' + escapeHtml(c.llmModel) + '</code>' : '<span class="text-dim">—</span>';
      var statusCls = 'cycle-status-' + escapeHtml(c.status);
      var tokensStr = (c.llmTokensIn || c.llmTokensOut)
        ? (c.llmTokensIn || 0) + ' / ' + (c.llmTokensOut || 0)
        : '<span class="text-dim">—</span>';

      html += '<tr class="' + statusCls + '">' +
        '<td>#' + c.id + '</td>' +
        '<td><span class="badge phase-' + escapeHtml(c.phase) + '">' + escapeHtml(c.phase) + '</span></td>' +
        '<td>' + escapeHtml(c.status) + '</td>' +
        '<td>' + providerBadge + '</td>' +
        '<td>' + modelStr + '</td>' +
        '<td>' + (c.llmCalls || 0) + '</td>' +
        '<td>' + tokensStr + '</td>' +
        '<td>' + escapeHtml(startedStr) + '</td>' +
        '<td>' + escapeHtml(durStr) + '</td>' +
        '</tr>';
      if (c.error) {
        html += '<tr class="cycle-error-row"><td colspan="9"><span class="text-dim">error:</span> ' + escapeHtml(c.error) + '</td></tr>';
      }
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }
/*
  function renderHypotheses() {
    var list = $('hypotheses-list');
    $('hypotheses-count').textContent = research.hypotheses.length;
    if (research.hypotheses.length === 0) {
      list.innerHTML = '<p class="empty-state">No hypotheses yet. The agent will produce them every other cycle.</p>';
      return;
    }
    var html = '';
    research.hypotheses.forEach(function (h) {
      var concepts = safeJsonArray(h.relatedConcepts);
      var arxivs = safeJsonArray(h.relatedArxivIds);
      var conceptBadges = concepts.map(function (c) {
        return '<span class="badge kind-concept">' + escapeHtml(c) + '</span>';
      }).join('');
      var arxivBadges = arxivs.map(function (a) {
        return '<span class="badge kind-object">arXiv:' + escapeHtml(a) + '</span>';
      }).join('');
      var stmt = (h.statement || '').slice(0, 200);
      if (h.statement && h.statement.length > 200) stmt += '…';
      html += '<div class="item-card">' +
        '<div class="item-header">' +
          '<span class="badge status-' + h.status + '">' + h.shortCode + '</span>' +
          '<div class="item-title">' + escapeHtml(h.title) + '</div>' +
        '</div>' +
        '<div class="item-meta">conf=' + (h.confidence || 0).toFixed(2) + ' · ' + (h._count ? h._count.attempts : 0) + ' attempts · ' + new Date(h.createdAt).toLocaleString() + '</div>' +
        '<div class="item-statement">' + escapeHtml(stmt) + '</div>' +
        '<div class="item-tags">' + conceptBadges + arxivBadges + '</div>' +
        '<details><summary>Show motivation & strategy</summary>' +
          '<p><strong>Motivation:</strong> ' + escapeHtml(h.motivation || '') + '</p>' +
          '<p><strong>Strategy:</strong> ' + escapeHtml(h.strategySketch || '') + '</p>' +
        '</details>' +
      '</div>';
    });
    list.innerHTML = html;
  }
*/
function renderHypotheses() {
  var list = $('hypotheses-list');
  $('hypotheses-count').textContent = research.hypotheses.length;
  if (research.hypotheses.length === 0) {
    list.innerHTML = '<p class="empty-state">No hypotheses yet. The agent will produce them every other cycle.</p>';
    return;
  }
  var html = '';
  research.hypotheses.forEach(function (h) {
    var concepts = safeJsonArray(h.relatedConcepts);
    var arxivs = safeJsonArray(h.relatedArxivIds);
    var conceptBadges = concepts.map(function (c) {
      return '<span class="badge kind-concept">' + escapeHtml(c) + '</span>';
    }).join('');
    var arxivBadges = arxivs.map(function (a) {
      return '<span class="badge kind-object">arXiv:' + escapeHtml(a) + '</span>';
    }).join('');
    var stmt = (h.statement || '').slice(0, 200);
    if (h.statement && h.statement.length > 200) stmt += '…';

    // ---- NEW: build .tex / .pdf action buttons ----
    // Path normalization: strip leading 'research/' if present (DB stores
    // 'research/hypotheses/H-XXXX.tex') and convert backslashes to forward
    // slashes so the URL is well-formed on Windows too.
    function normalizePath(p) {
      return String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^research\//i, '');
    }
    var actions = '';
    if (h.texPath) {
      actions += '<a href="/api/research/file?path=' + encodeURIComponent(normalizePath(h.texPath)) + '" target="_blank"><button class="ghost sm">.tex</button></a>';
    }
    if (h.pdfPath) {
      actions += '<a href="/api/research/file?path=' + encodeURIComponent(normalizePath(h.pdfPath)) + '" target="_blank"><button class="ghost sm">.pdf</button></a>';
    }
    // ----------------------------------------------

    html += '<div class="item-card">' +
      '<div class="item-header">' +
        '<span class="badge status-' + h.status + '">' + h.shortCode + '</span>' +
        '<div class="item-title">' + escapeHtml(h.title) + '</div>' +
      '</div>' +
      '<div class="item-meta">conf=' + (h.confidence || 0).toFixed(2) + ' · ' + (h._count ? h._count.attempts : 0) + ' attempts · ' + new Date(h.createdAt).toLocaleString() + '</div>' +
      '<div class="item-statement">' + escapeHtml(stmt) + '</div>' +
      '<div class="item-tags">' + conceptBadges + arxivBadges + '</div>' +
      (actions ? '<div class="item-actions" style="margin-top:8px;">' + actions + '</div>' : '') +
      '<details><summary>Show motivation & strategy</summary>' +
        '<p><strong>Motivation:</strong> ' + escapeHtml(h.motivation || '') + '</p>' +
        '<p><strong>Strategy:</strong> ' + escapeHtml(h.strategySketch || '') + '</p>' +
      '</details>' +
    '</div>';
  });
  list.innerHTML = html;
}
  function renderTheorems() {
    var list = $('theorems-list');
    $('theorems-count').textContent = research.theorems.length;
    if (research.theorems.length === 0) {
      list.innerHTML = '<div class="card" style="background:rgba(59,130,246,0.05); border-color:rgba(59,130,246,0.3);"><div class="card-body"><strong>No theorems yet</strong><p class="text-dim text-sm mt-2">The agent will promote a hypothesis to a theorem once a proof attempt passes the verifier with confidence ≥ 0.75. This is rare by design — most proofs will be rejected.</p></div></div>';
      return;
    }
    var html = '';
    research.theorems.forEach(function (t) {
      var tags = safeJsonArray(t.tags);
      var tagBadges = tags.map(function (tag) {
        return '<span class="badge kind-theorem">' + escapeHtml(tag) + '</span>';
      }).join('');
      var stmt = (t.statement || '').slice(0, 240);
      if (t.statement && t.statement.length > 240) stmt += '…';
      var actions = '<a href="/api/research/file?path=' + encodeURIComponent(t.proofTexPath) + '" target="_blank"><button class="ghost sm">.tex</button></a>';
      if (t.proofPdfPath) {
        actions += '<a href="/api/research/file?path=' + encodeURIComponent(t.proofPdfPath) + '" target="_blank"><button class="ghost sm">.pdf</button></a>';
      }
      html += '<div class="item-card theorem">' +
        '<div class="item-header">' +
          '<span class="badge status-proven">' + t.shortCode + '</span>' +
          '<div class="item-title">' + escapeHtml(t.title) + '</div>' +
        '</div>' +
        '<div class="item-meta">from ' + (t.hypothesis ? t.hypothesis.shortCode : '') + ' · proof ' + (t.attempt ? t.attempt.shortCode : '') + ' · ' + new Date(t.createdAt).toLocaleString() + '</div>' +
        '<div class="item-statement">' + escapeHtml(stmt) + '</div>' +
        '<div class="item-tags">' + tagBadges + '</div>' +
        '<div class="item-actions">' + actions + '</div>' +
      '</div>';
    });
    list.innerHTML = html;
  }

  function renderRiemann() {
    var list = $('riemann-list');
    $('riemann-count').textContent = research.riemann.length;
    if (research.riemann.length === 0) {
      list.innerHTML = '<p class="empty-state">No Riemann attempts yet. The agent runs one every 5 cycles. Send a <strong>Force Riemann attempt</strong> directive from the Guidance tab to trigger one immediately.</p>';
      return;
    }
    var html = '';
    research.riemann.forEach(function (r) {
      var cls = 'item-card' + (r.verdict === 'valid' ? ' riemann-valid' : '');
      var actions = '<a href="/api/research/file?path=' + encodeURIComponent(r.texPath) + '" target="_blank"><button class="ghost sm">.tex</button></a>';
      if (r.pdfPath) {
        actions += '<a href="/api/research/file?path=' + encodeURIComponent(r.pdfPath) + '" target="_blank"><button class="ghost sm">.pdf</button></a>';
      }
      actions += '<button class="ghost sm" onclick="var p=this.parentElement.querySelector(\'pre\');p.style.display=p.style.display?\'\':\'none\';">verifier report</button>';
      html += '<div class="' + cls + '">' +
        '<div class="item-header">' +
          '<span class="badge status-disproven">' + r.shortCode + '</span>' +
          '<div class="item-title">' + escapeHtml(r.strategy) + '</div>' +
        '</div>' +
        '<div class="item-meta">' + new Date(r.createdAt).toLocaleString() + '</div>' +
        '<div class="item-tags">' +
          '<span class="badge verdict-' + r.verdict + '">' + r.verdict + '</span>' +
          '<span class="text-dim text-sm">confidence = ' + (r.verifierConfidence || 0).toFixed(2) + '</span>' +
        '</div>' +
        '<div class="item-actions">' + actions + '</div>' +
        '<pre style="display:none; margin-top:8px; background:var(--bg-elev); padding:8px; border-radius:4px; font-size:11px; overflow-x:auto;">' + escapeHtml(r.verifierReport || '') + '</pre>' +
      '</div>';
    });
    list.innerHTML = html;
  }

  function renderArxiv() {
    var list = $('arxiv-list');
    $('arxiv-count').textContent = research.arxiv.length;
    if (research.arxiv.length === 0) {
      list.innerHTML = '<p class="empty-state">No ArXiv papers cached yet. The agent scans ArXiv every 3 cycles.</p>';
      return;
    }
    var html = '';
    research.arxiv.forEach(function (a) {
      html += '<div class="item-card">' +
        '<div class="item-header">' +
          '<span class="badge kind-object">' + escapeHtml(a.primaryCategory) + '</span>' +
          '<div class="item-title" style="font-size:13px;">' + escapeHtml(a.title) + '</div>' +
        '</div>' +
        '<div class="item-meta">arXiv:<a href="https://arxiv.org/abs/' + encodeURIComponent(a.arxivId) + '" target="_blank">' + escapeHtml(a.arxivId) + '</a> · relevance ' + (a.relevanceScore || 0).toFixed(2) + (a.publishedAt ? ' · ' + new Date(a.publishedAt).toLocaleDateString() : '') + '</div>' +
        (a.summary ? '<div class="text-sm" style="color:var(--text-muted); margin-top:6px; font-style:italic;">' + escapeHtml(a.summary) + '</div>' : '') +
        '<details><summary>Abstract</summary><p style="margin-top:4px; font-size:12px; color:var(--text-muted);">' + escapeHtml(a.abstract) + '</p></details>' +
      '</div>';
    });
    list.innerHTML = html;
  }

  function renderKG() {
    var nodesList = $('kg-nodes-list');
    var edgesList = $('kg-edges-list');
    $('kg-nodes-count').textContent = research.kg.nodes.length;
    $('kg-edges-count').textContent = research.kg.edges.length;
    if (research.kg.nodes.length === 0) {
      nodesList.innerHTML = '<p class="empty-state">No nodes yet.</p>';
    } else {
      var html = '';
      research.kg.nodes.forEach(function (n) {
        html += '<div class="kg-node">' +
          '<div class="kg-node-label"><span class="badge kind-' + n.kind + '">' + n.kind + '</span> ' + escapeHtml(n.label) + '</div>' +
          '<div class="kg-node-desc">' + escapeHtml(n.description) + '</div>' +
        '</div>';
      });
      nodesList.innerHTML = html;
    }
    if (research.kg.edges.length === 0) {
      edgesList.innerHTML = '<p class="empty-state">No edges yet.</p>';
    } else {
      var h = '';
      research.kg.edges.forEach(function (e) {
        h += '<div class="kg-edge">' +
          '<span class="kg-from">' + escapeHtml(e.fromNode.label) + '</span>' +
          '<span class="kg-relation">—[' + escapeHtml(e.relation) + ']→</span>' +
          '<span class="kg-to">' + escapeHtml(e.toNode.label) + '</span>' +
        '</div>';
      });
      edgesList.innerHTML = h;
    }
  }

  function renderProviders() {
    var list = $('providers-list');
    if (providers.length === 0) {
      list.innerHTML = '<p class="text-dim">Loading…</p>';
      return;
    }
    var html = '';
    providers.forEach(function (p) {
      html += '<div class="provider-card' + (p.available ? ' online' : '') + '">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span style="font-weight:600; font-size:13px;">' + escapeHtml(p.label) + '</span>' +
          '<span class="badge ' + (p.available ? 'status-proven' : '') + '">' + (p.available ? 'online' : 'offline') + '</span>' +
        '</div>' +
        '<div class="provider-model">' + escapeHtml(p.defaultModel) + '</div>' +
        (p.reason ? '<div class="provider-reason">' + escapeHtml(p.reason) + '</div>' : '') +
      '</div>';
    });
    list.innerHTML = html;
  }

  function renderBackbone() {
    var grid = $('backbone-grid');
    var html = '';
    BACKBONE_LAYERS.forEach(function (l) {
      var kInfo = l.k ? ' K=' + l.k : '';
      html += '<div class="layer-card">' +
        '<div class="layer-num ' + l.kind + '">L' + l.index + '</div>' +
        '<div>' +
          '<div class="layer-name">' + escapeHtml(l.name) + ' <span class="badge" style="font-size:10px;">' + l.kind + kInfo + '</span></div>' +
          '<div class="layer-role">' + escapeHtml(l.role) + '</div>' +
        '</div>' +
      '</div>';
    });
    grid.innerHTML = html;
  }

  // -------- Owner directives --------
  window.sendDirective = function (d) {
    if (!socket) return;
    socket.emit('directive', d);
  };

  // Priority override — controls the cycle interval.
  // critical=1s, high=5s, normal=60s, low=300s.
  window.sendPriority = function () {
    var sel = $('priority-select');
    if (!sel) return;
    var level = sel.value;
    if (!['low', 'normal', 'high', 'critical'].includes(level)) {
      showToast('Invalid priority', 'Must be low / normal / high / critical');
      return;
    }
    window.sendDirective({ kind: 'priority', priority: level });
    showToast('Priority set', 'Agent priority → ' + level);
  };

  // Force a specific phase for the next N cycles.
  window.sendForcePhase = function () {
    var sel = $('force-phase-select');
    var ttlInput = $('force-phase-ttl');
    if (!sel || !ttlInput) return;
    var phase = sel.value;
    var ttl = parseInt(ttlInput.value, 10);
    if (!phase) {
      showToast('Missing phase', 'Pick a phase to force.');
      return;
    }
    if (isNaN(ttl) || ttl < 1 || ttl > 20) {
      showToast('Invalid TTL', 'TTL must be an integer between 1 and 20.');
      return;
    }
    window.sendDirective({ kind: 'force-phase', phase: phase, ttl: ttl });
    showToast('Phase forced', phase + ' for ' + ttl + ' cycle(s)');
  };

  // Clear an active force-phase override.
  window.clearForcePhase = function () {
    window.sendDirective({ kind: 'force-phase', phase: 'idle', ttl: 0 });
    showToast('Override cleared', 'Standard phase cadence resumed');
  };

  window.injectHypothesis = function () {
    var title = $('inject-title').value.trim();
    var statement = $('inject-statement').value.trim();
    var motivation = $('inject-motivation').value.trim() || 'Owner-injected.';
    if (!title || !statement) {
      showToast('Missing fields', 'Title and statement are required.');
      return;
    }
    window.sendDirective({
      kind: 'inject-hypothesis',
      hypothesisDraft: {
        title: title,
        statement: statement,
        motivation: motivation,
        strategySketch: 'To be developed by the agent.',
        relatedConcepts: [],
        relatedArxivIds: [],
        confidence: 0.5
      }
    });
    $('inject-title').value = '';
    $('inject-statement').value = '';
    $('inject-motivation').value = '';
  };

  // -------- Init --------
  renderBackbone();
  connect();

  // Expose helpers publicly so inline event handlers in index.html and
  // future extensions can use them. Also marks them as 'used' for linters.
  window.zRiemannian = {
    el: el,
    $: $,
    sendDirective: window.sendDirective,
    sendPriority: window.sendPriority,
    sendForcePhase: window.sendForcePhase,
    clearForcePhase: window.clearForcePhase,
    injectHypothesis: window.injectHypothesis,
    switchTab: switchTab,
  };

  // Periodic snapshot refresh via HTTP (fallback if WS not connected)
  setInterval(function () {
    if (!connected) {
      fetch('/api/snapshot').then(function (r) { return r.json(); }).then(function (s) {
        snapshot = s;
        renderSnapshot();
      }).catch(function () {});
    }
  }, 5000);

  console.log('%czRiemannian web client ready', 'color:#f43f5e; font-weight:bold');
})();
