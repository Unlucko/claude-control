// Service Worker for push notifications

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'claude-control';
  const options = {
    body: data.body || 'Permission requested',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.sessionId || 'default',
    data: { sessionId: data.sessionId, url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'allow', title: 'Allow' },
      { action: 'deny', title: 'Deny' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { sessionId } = event.notification.data;

  if (event.action === 'allow' || event.action === 'deny') {
    // Send response back to server via fetch
    const input = event.action === 'allow' ? 'y\n' : 'n\n';
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        // Post to any open client
        for (const client of clients) {
          client.postMessage({ type: 'permission-response', sessionId, input });
        }
        // Also focus/open the app
        if (clients.length > 0) {
          clients[0].focus();
        } else {
          self.clients.openWindow('/');
        }
      })
    );
  } else {
    // Just open/focus the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        if (clients.length > 0) {
          clients[0].focus();
        } else {
          self.clients.openWindow('/');
        }
      })
    );
  }
});
