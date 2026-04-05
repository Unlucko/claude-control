import type WebSocket from 'ws';
import type * as pty from 'node-pty';

// ─── Session ────────────────────────────────────────────────────────────────

export type SessionType = 'claude' | 'agent' | 'terminal';

export type SessionStatus = 'running' | 'exited';

export interface SessionMeta {
  id: string;
  name: string;
  type: SessionType;
  agent?: string;
  cwd: string;
  pid: number;
  status: SessionStatus;
  claudeSessionId?: string;
  tmuxSession?: string;
  createdAt: number;
}

export interface SessionState {
  meta: SessionMeta;
  pty: pty.IPty;
  scrollback: string[];         // circular-ish array, capped at SCROLLBACK_LIMIT
  subscribers: Set<WebSocket>;
}

// ─── REST payloads ──────────────────────────────────────────────────────────

export interface CreateSessionBody {
  name?: string;
  type?: SessionType;
  agent?: string;
  cwd?: string;
  claudeSessionId?: string;
  tmuxSession?: string;
}

export interface InputBody {
  data: string;
}

export interface ResizeBody {
  cols: number;
  rows: number;
}

// ─── WebSocket message protocol ─────────────────────────────────────────────

export type WsClientMessage =
  | { type: 'subscribe';   sessionId: string }
  | { type: 'unsubscribe'; sessionId: string }
  | { type: 'input';       sessionId: string; data: string }
  | { type: 'resize';      sessionId: string; cols: number; rows: number }
  | { type: 'ping' };

export type WsServerMessage =
  | { type: 'sessions';    sessions: SessionMeta[] }
  | { type: 'scrollback';  sessionId: string; data: string }
  | { type: 'data';        sessionId: string; data: string }
  | { type: 'session_exit';sessionId: string; code: number | undefined }
  | { type: 'session_created'; session: SessionMeta }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'error';       message: string }
  | { type: 'pong' };
