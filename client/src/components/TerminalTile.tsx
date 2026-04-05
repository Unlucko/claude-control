import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../store';

interface Props {
  sessionId: string;
  isFocused: boolean;
}

export default function TerminalTile({ sessionId, isFocused }: Props) {
  const sessions = useStore(s => s.sessions);
  const permissions = useStore(s => s.permissions);
  const sendInput = useStore(s => s.sendInput);
  const sendResize = useStore(s => s.sendResize);
  const clearPermission = useStore(s => s.clearPermission);
  const setFocused = useStore(s => s.setFocused);
  const onSessionData = useStore(s => s.onSessionData);
  const onSessionScrollback = useStore(s => s.onSessionScrollback);

  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const session = sessions.find(s => s.id === sessionId);
  const perm = permissions[sessionId] ?? null;

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#000000',
        foreground: '#e0e0e0',
        cursor: '#ffffff',
        selectionBackground: '#333333',
      },
      fontFamily: "'Menlo', 'SF Mono', 'Consolas', monospace",
      fontSize: isFocused ? 13 : 10,
      cursorBlink: isFocused,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    requestAnimationFrame(() => fit.fit());

    terminalRef.current = term;
    fitRef.current = fit;

    const disposable = term.onData((data) => {
      sendInput(sessionId, data);
    });

    // Filter tmux DA responses and other escape noise
    const clean = (d: string) => d
      .replace(/\x1b\[\?[0-9;]*c/g, '')   // ESC[?...c DA response
      .replace(/\x1b\[>[0-9;]*c/g, '')    // ESC[>...c secondary DA
      .replace(/\x1b P[^\x1b]*\x1b\\/g, '') // DCS sequences
      .replace(/[0-9]+;[0-9]+;[0-9]+c/g, '') // leaked DA fragments like 1;2c0;276;0c
      ;

    const unsubData = onSessionData(sessionId, (data) => {
      const filtered = clean(data);
      if (filtered) term.write(filtered);
    });

    const unsubScrollback = onSessionScrollback(sessionId, (data) => {
      const filtered = clean(data);
      if (filtered) term.write(filtered);
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      sendResize(sessionId, term.cols, term.rows);
    });
    ro.observe(termRef.current);

    return () => {
      disposable.dispose();
      unsubData();
      unsubScrollback();
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, isFocused]);

  const handleAllow = useCallback(() => {
    sendInput(sessionId, 'y\n');
    clearPermission(sessionId);
  }, [sessionId, sendInput, clearPermission]);

  const handleDeny = useCallback(() => {
    sendInput(sessionId, 'n\n');
    clearPermission(sessionId);
  }, [sessionId, sendInput, clearPermission]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      border: '1px solid #222',
      overflow: 'hidden',
    }}>
      {/* tile header */}
      <div
        onClick={() => setFocused(isFocused ? null : sessionId)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          borderBottom: '1px solid #222',
          cursor: 'pointer',
          gap: 6,
          flexShrink: 0,
          background: '#0a0a0a',
        }}
      >
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: session?.status === 'running' ? '#30d158' : '#444',
        }} />
        <span style={{ fontSize: 11, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session?.name ?? 'session'}
        </span>
        {perm && (
          <span style={{ fontSize: 10, color: '#ff3b30', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>
            {perm.tool}
          </span>
        )}
        <span style={{ fontSize: 10, color: '#444' }}>
          {isFocused ? '[-]' : '[+]'}
        </span>
      </div>

      {/* permission bar */}
      {perm && (
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #222',
          borderLeft: '3px solid #ff3b30',
          background: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#ff3b30', fontSize: 11, fontWeight: 'bold' }}>{perm.tool}</div>
            <div style={{ color: '#666', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {perm.detail.split('\n')[0]}
            </div>
          </div>
          <button onClick={handleAllow} style={{ color: '#30d158', borderColor: '#30d158', fontSize: 11, padding: '4px 10px' }}>
            Y
          </button>
          <button onClick={handleDeny} style={{ color: '#ff3b30', borderColor: '#ff3b30', fontSize: 11, padding: '4px 10px' }}>
            N
          </button>
        </div>
      )}

      {/* terminal */}
      <div ref={termRef} style={{ flex: 1, overflow: 'hidden' }} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
