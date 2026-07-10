// zeta-riemannian-agent v1.0 — structured logger
// Lightweight logger that mirrors to console and an in-memory ring buffer
// so the WebSocket service can stream recent logs to new clients.

import type { AgentEvent } from './types';

const RING_SIZE = 500;
const ring: AgentEvent[] = [];

export function recentEvents(limit = 100): AgentEvent[] {
  return ring.slice(-limit);
}

export function emit(
  kind: AgentEvent['kind'],
  message: string,
  opts: {
    cycleId?: number;
    phase?: AgentEvent['phase'];
    payload?: Record<string, unknown>;
    level?: AgentEvent['level'];
    console?: boolean;
  } = {}
): AgentEvent {
  const ev: AgentEvent = {
    kind,
    message,
    cycleId: opts.cycleId,
    phase: opts.phase,
    payload: opts.payload,
    timestamp: new Date().toISOString(),
    level: opts.level ?? 'info',
  };
  ring.push(ev);
  if (ring.length > RING_SIZE) ring.shift();
  if (opts.console !== false) {
    const tag = `[zRiemannian:${ev.kind}]`;
    const line = `${ev.timestamp} ${tag} ${message}`;
    if (ev.level === 'error' || ev.level === 'critical') {
      console.error(line);
    } else if (ev.level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
  return ev;
}

export const log = {
  info: (msg: string, payload?: Record<string, unknown>) =>
    emit('log', msg, { payload, level: 'info' }),
  warn: (msg: string, payload?: Record<string, unknown>) =>
    emit('log', msg, { payload, level: 'warn' }),
  error: (msg: string, payload?: Record<string, unknown>) =>
    emit('error', msg, { payload, level: 'error' }),
  debug: (msg: string, payload?: Record<string,unknown>) =>
    emit('log', msg, { payload, level: 'debug', console: false }),
};
