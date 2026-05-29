'use client';

import { useEffect } from 'react';

const SUBSCRIBE_URL = '/api/notifications/subscribe';

async function saveSubscription(sub: PushSubscription, retries = 3): Promise<void> {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(SUBSCRIBE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(json),
      });
      if (res.ok) { console.info('[sw] push subscription saved'); return; }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else {
        console.warn('[sw] failed to save push subscription after', retries, 'attempts:', err);
      }
    }
  }
}

async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<void> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  try {
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: vapidKey,
    });
    await saveSubscription(sub);
  } catch (err) {
    console.warn('[sw] push subscribe failed:', err);
  }
}

async function registerPeriodicSync(reg: ServiceWorkerRegistration): Promise<void> {
  if (!('periodicSync' in reg)) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (reg as any).periodicSync.register('hc-hydration-check', {
      minInterval: 2 * 60 * 60 * 1000,
    });
  } catch {
    // Requires site engagement on Chrome Android — silently skip
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        await registerPeriodicSync(reg);

        // Ensure push subscription is active if permission was already granted
        if ('Notification' in window && Notification.permission === 'granted') {
          await subscribeToPush(reg);
        }

        // Re-subscribe when the user grants permission from the bell icon
        navigator.serviceWorker.addEventListener('message', async (event) => {
          if (event.data?.type === 'SUBSCRIBE_PUSH') {
            await subscribeToPush(reg);
          }
        });
      })
      .catch(() => {});
  }, []);

  return null;
}

// Call after user grants notification permission
export async function requestAndSubscribePush(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;

  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (perm !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  await subscribeToPush(reg);
  return true;
}

// Removes subscription from this device and backend
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(SUBSCRIBE_URL, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ endpoint }),
    });
    return true;
  } catch (err) {
    console.warn('[sw] unsubscribe failed:', err);
    return false;
  }
}
