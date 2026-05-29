'use client';

import { useEffect } from 'react';

const SUBSCRIBE_URL = '/api/notifications/subscribe';

// Converts VAPID base64url key to Uint8Array.
// iOS Safari requires a BufferSource — it rejects a raw base64url string.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function buffersMatch(a: Uint8Array, b: ArrayBuffer): boolean {
  const bArr = new Uint8Array(b);
  return a.length === bArr.length && a.every((v, i) => v === bArr[i]);
}

async function saveSubscription(sub: PushSubscription, retries = 3): Promise<boolean> {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(SUBSCRIBE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(json),
      });
      if (res.status === 401) { console.warn('[sw] session expired, subscription not saved'); return false; }
      if (res.ok) { console.info('[sw] push subscription saved'); return true; }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else {
        console.warn('[sw] failed to save push subscription after', retries, 'attempts:', err);
      }
    }
  }
  return false;
}

// fromUserGesture = true  → can create a new subscription (user clicked a button)
// fromUserGesture = false → only refresh/save an existing one (iOS blocks new subscriptions without gesture)
async function subscribeToPush(reg: ServiceWorkerRegistration, fromUserGesture = false): Promise<void> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  try {
    const existing = await reg.pushManager.getSubscription();
    let sub = existing;

    // Validate that the existing subscription was created with the current VAPID key.
    // Wrapped in its own try-catch so a comparison error never blocks the happy path.
    if (existing?.options?.applicationServerKey) {
      try {
        const currentKey  = urlBase64ToUint8Array(vapidKey);
        const existingKey = existing.options.applicationServerKey;
        if (!buffersMatch(currentKey, existingKey)) {
          console.info('[sw] VAPID key mismatch — removing stale subscription');
          await existing.unsubscribe();
          await fetch(SUBSCRIBE_URL, {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ endpoint: existing.endpoint }),
          }).catch(() => {});
          sub = null;
        }
      } catch (compareErr) {
        // Comparison failed (e.g. malformed key) — keep existing subscription and move on
        console.warn('[sw] VAPID key comparison failed, keeping existing subscription:', compareErr);
      }
    }

    if (!sub) {
      // iOS Safari does not allow pushManager.subscribe() outside a user-gesture stack.
      // If we're in the auto-mount path, skip and let the user trigger it via the bell / Ativar button.
      if (!fromUserGesture) {
        console.info('[sw] no subscription — waiting for user gesture to create one (iOS safe)');
        return;
      }
      // Pass key as Uint8Array — iOS Safari rejects the raw base64url string form
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

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

        // Auto-refresh existing subscription — NOT a user gesture, so won't create new on iOS
        if ('Notification' in window && Notification.permission === 'granted') {
          await subscribeToPush(reg, false);
        }

        // This message is sent when the user explicitly clicks the bell/Ativar button
        navigator.serviceWorker.addEventListener('message', async (event) => {
          if (event.data?.type === 'SUBSCRIBE_PUSH') {
            await subscribeToPush(reg, true);
          }
        });
      })
      .catch(() => {});
  }, []);

  return null;
}

// Called from user-gesture context (bell icon, Ativar button)
export async function requestAndSubscribePush(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;

  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (perm !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  await subscribeToPush(reg, true);  // true = user gesture, safe to create new subscription on iOS
  return true;
}

// Called from "Forçar re-registro" button — user gesture context
export async function forceResubscribePush(): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await fetch(SUBSCRIBE_URL, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => {});
      await existing.unsubscribe();
    }
    await subscribeToPush(reg, true);  // user gesture — can create fresh subscription
    return true;
  } catch (err) {
    console.warn('[sw] force resubscribe failed:', err);
    return false;
  }
}

// Called from "Desativar" button
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
