'use client';

import { useState, useEffect, useCallback } from 'react';

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export interface NotificationState {
  permissionState: PermissionState;
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready.catch(() => null);
}

export function useNotifications(): NotificationState {
  const [permissionState, setPermissionState] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!('PushManager' in window) || !('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }
    setPermissionState(Notification.permission as PermissionState);
    getSwRegistration().then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PermissionState);
      if (permission !== 'granted') return false;

      const reg = await getSwRegistration();
      if (!reg) return false;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
      if (!vapidKey) return false;

      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapidKey),
      });

      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });

      if (res.ok) { setIsSubscribed(true); return true; }
      return false;
    } catch (err) {
      console.error('Push subscribe error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const reg = await getSwRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setIsSubscribed(false); return; }

      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { permissionState, isSubscribed, isLoading, subscribe, unsubscribe };
}
