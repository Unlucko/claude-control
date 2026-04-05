import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store';
import TerminalTile from './TerminalTile';
import DetectedTile from './DetectedTile';
import SpiralLayout from './SpiralLayout';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function TilingLayout() {
  const sessions = useStore(s => s.sessions);
  const focusedSessionId = useStore(s => s.focusedSessionId);
  const setFocused = useStore(s => s.setFocused);
  const permissions = useStore(s => s.permissions);
  const activeSessionId = useStore(s => s.activeSessionId);
  const subscribeSession = useStore(s => s.subscribeSession);
  const subscribedIds = useStore(s => s.subscribedIds);
  const sendInput = useStore(s => s.sendInput);
  const token = useStore(s => s.token);
  const [listening, setListening] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [newCwd, setNewCwd] = useState('~');
  const [detected, setDetected] = useState<Array<{ pid: number; cwd: string; sessionId?: string }>>([]);
  const recognitionRef = useRef<any>(null);

  // auto-subscribe to every session as it appears
  useEffect(() => {
    for (const s of sessions) {
      if (!subscribedIds.has(s.id)) {
        subscribeSession(s.id);
      }
    }
  }, [sessions, subscribedIds, subscribeSession]);

  // force re-subscribe on reconnect
  useEffect(() => {
    if (sessions.length > 0) {
      const timer = setTimeout(() => {
        for (const s of sessions) subscribeSession(s.id);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [sessions.length]);

  // poll for detected system processes
  useEffect(() => {
    const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
    const poll = () => {
      fetch('/api/system-sessions', { headers })
        .then(r => r.json())
        .then(setDetected)
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [token]);

  const runningSessions = sessions.filter(s => s.status === 'running');
  const visibleSessions = focusedSessionId
    ? sessions.filter(s => s.id === focusedSessionId)
    : runningSessions.length > 0 ? runningSessions : sessions;

  // voice - sends to focused or first session
  const toggleVoice = useCallback(() => {
    if (!SpeechRecognition) return;

    // stop if already listening
    if (listening && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const targetId = focusedSessionId ?? sessions[0]?.id;
    if (!targetId) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        sendInput(targetId, finalTranscript);
        finalTranscript = '';
      }
    };

    recognition.onerror = (e: any) => {
      // 'no-speech' is not fatal, keep listening
      if (e.error === 'no-speech') return;
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      // iOS Safari fires onend prematurely - restart if still listening
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
          setListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, focusedSessionId, sessions, sendInput]);

  // create session from UI
  const createSession = useCallback((type: 'claude' | 'terminal') => {
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        name: type === 'terminal' ? 'terminal' : 'claude',
        cwd: newCwd,
      }),
    }).then(() => setShowNewMenu(false)).catch(() => {});
  }, [token, newCwd]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* session tabs + controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #222',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* tabs - scrollable */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'auto',
          minWidth: 0,
        }}>
          {/* "all" tab */}
          <div
            onClick={() => setFocused(null)}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              cursor: 'pointer',
              borderRight: '1px solid #222',
              background: !focusedSessionId ? '#111' : 'transparent',
              color: !focusedSessionId ? '#fff' : '#555',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            all ({sessions.length})
          </div>
          {sessions.map(s => {
            const focused = focusedSessionId === s.id;
            const isActive = activeSessionId === s.id;
            const hasPerm = !!permissions[s.id];
            return (
              <div
                key={s.id}
                onClick={() => setFocused(focused ? null : s.id)}
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  borderRight: '1px solid #222',
                  borderBottom: isActive ? '2px solid #f0a030' : '2px solid transparent',
                  background: focused ? '#111' : 'transparent',
                  color: focused ? '#fff' : isActive ? '#f0a030' : hasPerm ? '#ff3b30' : '#666',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: s.status === 'running' ? '#30d158' : '#444',
                }} />
                {s.name}
                {hasPerm && <span style={{ color: '#ff3b30', animation: 'pulse 1.5s infinite' }}>!</span>}
              </div>
            );
          })}
        </div>
        {/* controls */}
        <button
          onClick={() => setShowNewMenu(!showNewMenu)}
          style={{ border: 'none', borderLeft: '1px solid #222', fontSize: 16, padding: '4px 10px', color: '#fff', flexShrink: 0 }}
        >
          +
        </button>
        <button
          onClick={toggleVoice}
          style={{ border: 'none', borderLeft: '1px solid #222', fontSize: 13, padding: '4px 8px', color: listening ? '#ff3b30' : '#555', flexShrink: 0 }}
        >
          mic
        </button>
      </div>

      {/* new session menu */}
      {showNewMenu && (
        <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid #222',
          background: '#0a0a0a',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={newCwd}
              onChange={e => setNewCwd(e.target.value)}
              placeholder="~/path"
              style={{
                flex: 1, background: '#111', border: '1px solid #333', color: '#fff',
                padding: '6px 8px', fontFamily: 'inherit', fontSize: 12,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => createSession('claude')}
              style={{ flex: 1, fontSize: 12, padding: '8px', borderColor: '#333' }}
            >
              claude
            </button>
            <button
              onClick={() => createSession('terminal')}
              style={{ flex: 1, fontSize: 12, padding: '8px', borderColor: '#333' }}
            >
              terminal
            </button>
          </div>
        </div>
      )}

      {/* tiling area - spiral layout */}
      {visibleSessions.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
          no active sessions -- tap + to create
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
          <SpiralLayout
            items={visibleSessions.map(s => (
              <TerminalTile key={s.id} sessionId={s.id} isFocused={focusedSessionId === s.id} />
            ))}
          />
        </div>
      )}

      {/* detected external sessions - compact bar at bottom */}
      {!focusedSessionId && detected.length > 0 && (
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid #222',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {detected.map(d => (
            <DetectedTile key={d.pid} pid={d.pid} cwd={d.cwd} sessionId={d.sessionId} />
          ))}
        </div>
      )}
    </div>
  );
}
