import { create } from 'zustand';
import { detectPermission, type PermissionRequest } from './permissions';

interface SessionMeta {
  id: string;
  name: string;
  type: 'claude' | 'agent' | 'terminal';
  agent?: string;
  cwd: string;
  pid: number;
  status: 'running' | 'exited';
  createdAt: number;
}

interface Store {
  // connection
  connected: boolean;
  ws: WebSocket | null;
  token: string;

  // sessions
  sessions: SessionMeta[];
  subscribedIds: Set<string>;
  focusedSessionId: string | null; // null = tiling view, string = fullscreen one
  activeSessionId: string | null; // which session has cursor/input focus

  // permissions - per session
  permissions: Record<string, PermissionRequest | null>;

  // recent output buffer per session (for permission detection)
  _recentBuffers: Record<string, string>;

  // actions
  setToken: (t: string) => void;
  connect: () => void;
  disconnect: () => void;
  subscribeSession: (id: string) => void;
  unsubscribeSession: (id: string) => void;
  subscribeAll: () => void;
  setFocused: (id: string | null) => void;
  setActive: (id: string | null) => void;
  sendInput: (sessionId: string, data: string) => void;
  sendResize: (sessionId: string, cols: number, rows: number) => void;
  killSession: (sessionId: string) => void;
  clearPermission: (sessionId: string) => void;

  // data handler for xterm - registered per session
  _dataListeners: Record<string, Set<(data: string) => void>>;
  onSessionData: (sessionId: string, cb: (data: string) => void) => () => void;

  // scrollback handler
  _scrollbackListeners: Record<string, Set<(data: string) => void>>;
  onSessionScrollback: (sessionId: string, cb: (data: string) => void) => () => void;
}

function getWsUrl(token: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws?token=${token}`;
}

export const useStore = create<Store>((set, get) => ({
  connected: false,
  ws: null,
  token: localStorage.getItem('cc_token') ?? '',
  sessions: [],
  subscribedIds: new Set(),
  focusedSessionId: null,
  activeSessionId: null,
  permissions: {},
  _recentBuffers: {},
  _dataListeners: {},
  _scrollbackListeners: {},

  setToken: (t) => {
    localStorage.setItem('cc_token', t);
    set({ token: t });
  },

  connect: () => {
    const { token, ws: existing } = get();
    if (existing) existing.close();
    if (!token) return;

    const ws = new WebSocket(getWsUrl(token));

    ws.onopen = () => set({ connected: true });
    ws.onclose = () => set({ connected: false, ws: null });

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const state = get();

      switch (msg.type) {
        case 'sessions':
          set({ sessions: msg.sessions });
          break;

        case 'session_created': {
          const exists = state.sessions.some(s => s.id === msg.session.id);
          if (!exists) {
            set({ sessions: [...state.sessions, msg.session] });
          }
          break;
        }

        case 'session_deleted': {
          const newSub = new Set(state.subscribedIds);
          newSub.delete(msg.sessionId);
          const { [msg.sessionId]: _p, ...restPermissions } = state.permissions;
          const { [msg.sessionId]: _b, ...restBuffers } = state._recentBuffers;
          set({
            sessions: state.sessions.filter(s => s.id !== msg.sessionId),
            subscribedIds: newSub,
            focusedSessionId: state.focusedSessionId === msg.sessionId ? null : state.focusedSessionId,
            permissions: restPermissions,
            _recentBuffers: restBuffers,
          });
          break;
        }

        case 'data': {
          const listeners = state._dataListeners[msg.sessionId];
          if (listeners) {
            for (const cb of listeners) cb(msg.data);
          }

          // permission detection
          const buf = (state._recentBuffers[msg.sessionId] ?? '') + msg.data;
          const trimmed = buf.slice(-3000);
          const perm = detectPermission(msg.data, state._recentBuffers[msg.sessionId] ?? '');
          set({
            _recentBuffers: { ...state._recentBuffers, [msg.sessionId]: trimmed },
            ...(perm ? { permissions: { ...state.permissions, [msg.sessionId]: perm } } : {}),
          });
          break;
        }

        case 'scrollback': {
          const sbl = state._scrollbackListeners[msg.sessionId];
          if (sbl) {
            for (const cb of sbl) cb(msg.data);
          }

          // also scan scrollback tail for pending permission
          const perm = detectPermission(msg.data, '');
          if (perm) {
            set({ permissions: { ...state.permissions, [msg.sessionId]: perm } });
          }
          break;
        }

        case 'session_exit':
          set({
            sessions: state.sessions.map(s =>
              s.id === msg.sessionId ? { ...s, status: 'exited' as const } : s
            ),
            permissions: { ...state.permissions, [msg.sessionId]: null },
          });
          break;
      }
    };

    set({ ws });
  },

  disconnect: () => {
    get().ws?.close();
    set({ ws: null, connected: false });
  },

  subscribeSession: (id) => {
    const { ws, subscribedIds } = get();
    if (!ws || subscribedIds.has(id)) return;
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }));
    const next = new Set(subscribedIds);
    next.add(id);
    set({ subscribedIds: next });
  },

  unsubscribeSession: (id) => {
    const { ws, subscribedIds } = get();
    if (!ws || !subscribedIds.has(id)) return;
    ws.send(JSON.stringify({ type: 'unsubscribe', sessionId: id }));
    const next = new Set(subscribedIds);
    next.delete(id);
    set({ subscribedIds: next });
  },

  subscribeAll: () => {
    const { sessions, subscribeSession } = get();
    for (const s of sessions) {
      subscribeSession(s.id);
    }
  },

  setFocused: (id) => {
    set({ focusedSessionId: id });
  },

  setActive: (id) => {
    set({ activeSessionId: id });
  },

  sendInput: (sessionId, data) => {
    const { ws } = get();
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'input', sessionId, data }));
  },

  sendResize: (sessionId, cols, rows) => {
    const { ws } = get();
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'resize', sessionId, cols, rows }));
  },

  killSession: (sessionId) => {
    const { token } = get();
    fetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  },

  clearPermission: (sessionId) => {
    set({ permissions: { ...get().permissions, [sessionId]: null } });
  },

  onSessionData: (sessionId, cb) => {
    const state = get();
    const listeners = state._dataListeners[sessionId] ?? new Set();
    listeners.add(cb);
    set({ _dataListeners: { ...state._dataListeners, [sessionId]: listeners } });
    return () => {
      listeners.delete(cb);
    };
  },

  onSessionScrollback: (sessionId, cb) => {
    const state = get();
    const listeners = state._scrollbackListeners[sessionId] ?? new Set();
    listeners.add(cb);
    set({ _scrollbackListeners: { ...state._scrollbackListeners, [sessionId]: listeners } });
    return () => {
      listeners.delete(cb);
    };
  },
}));
