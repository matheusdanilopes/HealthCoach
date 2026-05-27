'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export interface NotificationState {
  permissionState: PermissionState;
  isEnabled: boolean;
  isLoading: boolean;
  enable: () => Promise<boolean>;
  disable: () => void;
}

interface QueuedNotification {
  id: string;
  title: string;
  body?: string;
  url?: string;
}

const STORAGE_KEY = 'hc_notifications_enabled';
const POLL_INTERVAL = 30_000;

export function useNotifications(): NotificationState {
  const [permissionState, setPermissionState] = useState<PermissionState>('default');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!('Notification' in window)) {
      setPermissionState('unsupported');
      return;
    }
    setPermissionState(Notification.permission as PermissionState);
    const saved = localStorage.getItem(STORAGE_KEY) === 'true';
    setIsEnabled(saved && Notification.permission === 'granted');
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/pending');
      if (!res.ok) return;
      const items: QueuedNotification[] = await res.json();
      if (!items.length) return;

      if (Notification.permission === 'granted') {
        for (const item of items) {
          const n = new Notification(item.title, {
            body: item.body ?? '',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            tag: item.id,
          });
          n.onclick = () => {
            window.focus();
            if (item.url) window.location.href = item.url;
            n.close();
          };
        }
      }

      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: items.map((i) => i.id) }),
      });
    } catch {
      // silently ignore network errors
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isEnabled) return;
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isEnabled, poll]);

  const enable = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (!('Notification' in window)) return false;
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PermissionState);
      if (permission !== 'granted') return false;
      localStorage.setItem(STORAGE_KEY, 'true');
      setIsEnabled(true);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disable = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsEnabled(false);
  }, []);

  return { permissionState, isEnabled, isLoading, enable, disable };
}
