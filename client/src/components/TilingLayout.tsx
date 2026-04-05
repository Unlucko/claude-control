import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import TerminalTile from './TerminalTile';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function TilingLayout() {
  const sessions = useStore(s => s.sessions);
  const focusedSessionId = useStore(s => s.focusedSessionId);
  const subscribeAll = useStore(s => s.subscribeAll);
  const sendInput = useStore(s => s.sendInput);
  const subscribeSession = useStore(s => s.subscribeSession);
  const [listening, setListening] = useState(false);

  // subscribe to all sessions on mount and when new ones appear
  useEffect(() => {
    subscribeAll();
  }, [sessions.length, subscribeAll]);

  // also subscribe individually when a new session arrives
  useEffect(() => {
    for (const s of sessions) {
      subscribeSession(s.id);
    }
  }, [sessions, subscribeSession]);

  const runningSessions = sessions.filter(s => s.status === 'running');
  const visibleSessions = focusedSessionId
    ? sessions.filter(s => s.id === focusedSessionId)
    : runningSessions.length > 0 ? runningSessions : sessions;

  // voice - sends to focused session or first session
  const toggleVoice = useCallback(() => {
    if (!SpeechRecognition) return;

    if (listening) return;

    const targetId = focusedSessionId ?? sessions[0]?.id;
    if (!targetId) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      sendInput(targetId, text);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognition.start();
    setListening(true);
  }, [listening, focusedSessionId, sessions, sendInput]);

  if (sessions.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
        no active sessions
      </div>
    );
  }

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
          {focusedSessionId ? '1' : visibleSessions.length} / {sessions.length}
        </span>
        <button
          onClick={toggleVoice}
          style={{
            border: 'none',
            fontSize: 16,
            padding: '2px 6px',
            color: listening ? '#ff3b30' : '#555',
          }}
        >
          mic
        </button>
      </div>

      {/* tiles */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        {visibleSessions.map(s => (
          <TerminalTile
            key={s.id}
            sessionId={s.id}
            isFocused={focusedSessionId === s.id}
          />
        ))}
      </div>
    </div>
  );
}
