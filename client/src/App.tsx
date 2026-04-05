import { useEffect } from 'react';
import { useStore } from './store';
import TilingLayout from './components/TilingLayout';
import TokenInput from './components/TokenInput';

export default function App() {
  const token = useStore(s => s.token);
  const connected = useStore(s => s.connected);
  const connect = useStore(s => s.connect);

  useEffect(() => {
    if (token) connect();
  }, [token, connect]);

  if (!token) return <TokenInput />;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: 3,
        background: connected ? '#30d158' : '#ff3b30',
        transition: 'background 0.3s',
      }} />
      <TilingLayout />
    </div>
  );
}
