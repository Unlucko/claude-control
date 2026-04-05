interface Props {
  pid: number;
  cwd: string;
  sessionId?: string;
}

export default function DetectedTile({ pid, cwd, sessionId }: Props) {
  const shortCwd = cwd.split('/').slice(-2).join('/');

  return (
    <div style={{
      padding: '6px 10px',
      borderLeft: '2px solid #f0a030',
      background: '#050505',
      flexShrink: 0,
      flex: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f0a030' }} />
        <span style={{ fontSize: 11, color: '#f0a030' }}>claude:{pid}</span>
        <span style={{ fontSize: 10, color: '#444' }}>{shortCwd}</span>
        {sessionId && <span style={{ fontSize: 9, color: '#333' }}>[{sessionId.slice(0, 8)}]</span>}
      </div>
    </div>
  );
}
