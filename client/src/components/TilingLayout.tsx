import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store';
import TerminalTile from './TerminalTile';
import DetectedTile from './DetectedTile';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function TilingLayout() {
  const sessions = useStore(s => s.sessions);
  const focusedSessionId = useStore(s => s.focusedSessionId);
  const subscribeSession = useStore(s => s.subscribeSession);
  const subscribedIds = useStore(s => s.subscribedIds);
  const sendInput = useStore(s => s.sendInput);
  const token = useStore(s => s.token);
  const [listening, setListening] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [newCwd, setNewCwd] = useState('~');
  const [detected, setDetected] = useState<Array<{ pid: number; cwd: string; sessionId?: string }>>([]);
  const recognitionRef = useRef<any>(null);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  // detect orientation changes
  useEffect(() => {
    const update = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

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
      {/* top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderBottom: '1px solid #222',
        flexShrink: 0,
        gap: 8,
      }}>
        <span style={{ fontSize: 12, color: '#555', flex: 1 }}>
          {visibleSessions.length}/{sessions.length}
        </span>
        <button
          onClick={() => setShowNewMenu(!showNewMenu)}
          style={{ border: 'none', fontSize: 16, padding: '2px 8px', color: '#fff' }}
        >
          +
        </button>
        <button
          onClick={toggleVoice}
          style={{ border: 'none', fontSize: 14, padding: '2px 6px', color: listening ? '#ff3b30' : '#555' }}
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

      {/* tiling area - managed sessions take all space */}
      {visibleSessions.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
          no active sessions -- tap + to create
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          minHeight: 0,
          minWidth: 0,
        }}>
          {visibleSessions.map(s => (
            <TerminalTile key={s.id} sessionId={s.id} isFocused={focusedSessionId === s.id} />
          ))}
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
