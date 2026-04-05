import { useEffect } from 'react';
import { useStore } from './store';
import TilingLayout from './components/TilingLayout';
import TokenInput from './components/TokenInput';

async function setupPush(token: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Get VAPID key from server
    const res = await fetch('/api/push/vapid-key', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const { publicKey } = await res.json();
    if (!publicKey) return;

    // Subscribe to push
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
    }

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sub),
    });

    // Listen for permission responses from SW notification actions
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'permission-response') {
        const { sessionId, input } = event.data;
        useStore.getState().sendInput(sessionId, input);
      }
    });
  } catch (e) {
    console.warn('Push setup failed:', e);
  }
}

export default function App() {
  const token = useStore(s => s.token);
  const connected = useStore(s => s.connected);
  const connect = useStore(s => s.connect);

  useEffect(() => {
    if (token) {
      connect();
      setupPush(token);
    }
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
