'use client';

import { useEffect } from 'react';

// iOS Safari requires Uint8Array — Chrome/Android accepts raw base64url string
function vapidKeyToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64  = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  const buf     = new ArrayBuffer(raw.length);
  const arr     = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<void> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  try {
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: vapidKeyToUint8Array(vapidKey),
    });

    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await fetch('/api/notifications/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(json),
    });
    console.log('[sw] Push subscription saved');
  } catch (err) {
    console.warn('[sw] Push subscribe failed:', err);
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
    // Needs site engagement on Chrome Android
  }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        await registerPeriodicSync(reg);

        // If notifications already granted, ensure we have a push subscription
        if ('Notification' in window && Notification.permission === 'granted') {
          await subscribeToPush(reg);
        }

        // Listen for future permission grants (e.g. user clicks bell in WaterTracker)
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

// Call this after user grants notification permission to register push subscription
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
