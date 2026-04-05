import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_EMAIL = process.env.VAPID_EMAIL ?? 'mailto:test@test.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

// Store push subscriptions
const subscriptions = new Set<webpush.PushSubscription>();

export function addSubscription(sub: webpush.PushSubscription): void {
  subscriptions.add(sub);
}

export function removeSubscription(sub: webpush.PushSubscription): void {
  subscriptions.delete(sub);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC;
}

export function sendPermissionNotification(sessionName: string, tool: string, sessionId: string): void {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const payload = JSON.stringify({
    title: `${sessionName} - Permission`,
    body: `${tool} requires approval`,
    sessionId,
    url: '/',
  });

  const dead: webpush.PushSubscription[] = [];

  for (const sub of subscriptions) {
    webpush.sendNotification(sub, payload).catch(() => {
      dead.push(sub);
    });
  }

  // Clean up dead subscriptions
  setTimeout(() => {
    for (const sub of dead) subscriptions.delete(sub);
  }, 1000);
}
