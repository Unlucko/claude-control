import { useState } from 'react';
import { useStore } from '../store';

export default function TokenInput() {
  const setToken = useStore(s => s.setToken);
  const [value, setValue] = useState('');

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
    }}>
      <div style={{ fontSize: 18, color: '#fff', marginBottom: 8 }}>claude-control</div>
      <input
        type="password"
        placeholder="token"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && value && setToken(value)}
        style={{
          width: '100%',
          maxWidth: 300,
          padding: '10px 12px',
          background: '#111',
          border: '1px solid #333',
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 14,
          outline: 'none',
        }}
      />
      <button
        onClick={() => value && setToken(value)}
        style={{
          padding: '10px 32px',
          border: '1px solid #444',
          color: '#fff',
          fontSize: 13,
        }}
      >
        connect
      </button>
    </div>
  );
}
