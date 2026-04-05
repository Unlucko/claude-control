import * as pty from 'node-pty';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type {
  SessionMeta,
  SessionState,
  SessionType,
  WsServerMessage,
} from './types';

const SCROLLBACK_LIMIT = 10_000;

// ─── Store ───────────────────────────────────────────────────────────────────

const sessions = new Map<string, SessionState>();

// All open WS connections (for broadcasting session list changes)
const allConnections = new Set<WebSocket>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(subs: Set<WebSocket>, msg: WsServerMessage): void {
  for (const ws of subs) {
    send(ws, msg);
  }
}

function broadcastAll(msg: WsServerMessage): void {
  broadcast(allConnections, msg);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function registerConnection(ws: WebSocket): void {
  allConnections.add(ws);
  ws.on('close', () => allConnections.delete(ws));
  // Send current session list on connect
  send(ws, { type: 'sessions', sessions: listSessions() });
}

export function createSession(opts: {
  spawnFile: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  cols?: number;
  rows?: number;
  name: string;
  type: SessionType;
  agent?: string;
  claudeSessionId?: string;
}): SessionMeta {
  const id = randomUUID();
  const cols = opts.cols ?? 220;
  const rows = opts.rows ?? 50;

  // Filter out undefined values — node-pty rejects envs with undefined entries
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;

  const proc = pty.spawn(opts.spawnFile, opts.args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: opts.cwd,
    env: { ...baseEnv, ...opts.env },
  });

  const meta: SessionMeta = {
    id,
    name: opts.name,
    type: opts.type,
    agent: opts.agent,
    cwd: opts.cwd,
    pid: proc.pid,
    status: 'running',
    claudeSessionId: opts.claudeSessionId,
    createdAt: Date.now(),
  };

  const state: SessionState = {
    meta,
    pty: proc,
    scrollback: [],
    subscribers: new Set(),
  };

  sessions.set(id, state);

  proc.onData((data) => {
    // Append to scrollback (simple line-based cap)
    state.scrollback.push(data);
    if (state.scrollback.length > SCROLLBACK_LIMIT) {
      state.scrollback.splice(0, state.scrollback.length - SCROLLBACK_LIMIT);
    }
    broadcast(state.subscribers, { type: 'data', sessionId: id, data });
  });

  proc.onExit(({ exitCode }) => {
    meta.status = 'exited';
    broadcast(state.subscribers, { type: 'session_exit', sessionId: id, code: exitCode });
    broadcastAll({ type: 'sessions', sessions: listSessions() });
  });

  broadcastAll({ type: 'session_created', session: meta });
  broadcastAll({ type: 'sessions', sessions: listSessions() });

  return meta;
}

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

export function listSessions(): SessionMeta[] {
  return Array.from(sessions.values()).map((s) => s.meta);
}

export function sendInput(id: string, data: string): boolean {
  const state = sessions.get(id);
  if (!state || state.meta.status === 'exited') return false;
  state.pty.write(data);
  return true;
}

export function resizeSession(id: string, cols: number, rows: number): boolean {
  const state = sessions.get(id);
  if (!state || state.meta.status === 'exited') return false;
  state.pty.resize(cols, rows);
  return true;
}

export function killSession(id: string): boolean {
  const state = sessions.get(id);
  if (!state) return false;
  try {
    state.pty.kill();
  } catch {
    // already dead
  }
  sessions.delete(id);
  broadcastAll({ type: 'session_deleted', sessionId: id });
  broadcastAll({ type: 'sessions', sessions: listSessions() });
  return true;
}

export function subscribeToSession(id: string, ws: WebSocket): boolean {
  const state = sessions.get(id);
  if (!state) return false;
  state.subscribers.add(ws);
  ws.on('close', () => state.subscribers.delete(ws));
  // Replay scrollback
  if (state.scrollback.length > 0) {
    send(ws, {
      type: 'scrollback',
      sessionId: id,
      data: state.scrollback.join(''),
    });
  }
  return true;
}

export function unsubscribeFromSession(id: string, ws: WebSocket): void {
  const state = sessions.get(id);
  if (state) state.subscribers.delete(ws);
}
