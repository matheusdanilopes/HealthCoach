'use client';

import { useEffect, useRef } from 'react';
import type { WaterLogEntry } from '@/types';

const COOLDOWN_MS       = 90 * 60 * 1000; // 90 min between notifications
const MAX_DAILY         = 5;
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 min while tab is open
const QUIET_START       = 22;
const QUIET_END         = 7;

// Use device local time — acceptable because the user is actively using the device
function isQuietHour(): boolean {
  const h = new Date().getHours();
  return h >= QUIET_START || h < QUIET_END;
}

function dailyKey(): string {
  const d = new Date();
  return `hc_wnotif_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
}

function dailyCount(): number {
  try { return parseInt(localStorage.getItem(dailyKey()) ?? '0', 10); } catch { return 0; }
}

function bumpDailyCount(): void {
  try { localStorage.setItem(dailyKey(), String(dailyCount() + 1)); } catch { /**/ }
}

function lastNotifTime(): number {
  try { return parseInt(localStorage.getItem('hc_last_wnotif') ?? '0', 10); } catch { return 0; }
}

function saveNotifTime(): void {
  try { localStorage.setItem('hc_last_wnotif', String(Date.now())); } catch { /**/ }
}

function canNotify(): boolean {
  if (typeof window === 'undefined') return false;
  if (isQuietHour()) return false;
  if (Date.now() - lastNotifTime() < COOLDOWN_MS) return false;
  if (dailyCount() >= MAX_DAILY) return false;
  return true;
}

async function notify(title: string, body: string): Promise<void> {
  if (!canNotify()) return;

  saveNotifTime();
  bumpDailyCount();

  // Try server-side Web Push first — reaches the device even when the tab loses focus
  try {
    const res  = await fetch('/api/notifications/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, body, tag: 'hc-hydration', url: '/dashboard' }),
    });
    const data = await res.json();
    if (data.sent > 0) return;
  } catch { /**/ }

  // Fallback: show via registered service worker
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon:  '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag:   'hc-hydration',
        data:  { url: '/dashboard' },
      });
      return;
    } catch { /**/ }

    // Last resort: browser Notification API (foreground only)
    try { new Notification(title, { body, icon: '/icons/icon-192x192.png', tag: 'hc-hydration' }); }
    catch { /**/ }
  }
}

export function useHydrationReminder(logs: WaterLogEntry[], target: number, mealHydrationMl = 0): void {
  const logsRef          = useRef(logs);
  const targetRef        = useRef(target);
  const mealHydrationRef = useRef(mealHydrationMl);

  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { targetRef.current = target; }, [target]);
  useEffect(() => { mealHydrationRef.current = mealHydrationMl; }, [mealHydrationMl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function check(): void {
      const currentLogs   = logsRef.current;
      const currentTarget = targetRef.current;
      const total = currentLogs.reduce((s, l) => s + l.amount_ml, 0) + mealHydrationRef.current;

      if (isQuietHour()) return;

      const lastLog  = currentLogs.length > 0 ? currentLogs[currentLogs.length - 1] : null;
      const minSince = lastLog
        ? Math.max(0, Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 60_000))
        : 999;
      const pct = currentTarget > 0 ? total / currentTarget : 0;
      const h   = new Date().getHours();

      // Goal achieved — positive reinforcement once per day
      if (total >= currentTarget) {
        const key = `hc_congrats_${new Date().toDateString()}`;
        try {
          if (!localStorage.getItem(key)) {
            notify('Meta de hidratação atingida! 🎉', 'Parabéns! Você completou sua meta de água hoje.');
            localStorage.setItem(key, '1');
          }
        } catch { /**/ }
        return;
      }

      if (minSince > 120) {
        const remaining = currentTarget - total;
        notify('Hora de beber água 💧', `Você está há mais de 2h sem se hidratar. Faltam ${remaining}ml para a meta.`);
        return;
      }

      if (h >= 15 && pct < 0.5) {
        notify('Consumo de água baixo hoje 💧', `Você consumiu apenas ${Math.round(pct * 100)}% da meta diária.`);
        return;
      }

      if (h >= 19 && pct < 0.75) {
        const remaining = currentTarget - total;
        notify('Hidratação do dia quase completa 💧', `Ainda faltam ${remaining}ml para completar a meta de hoje.`);
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    function onVisibility() { if (!document.hidden) check(); }
    document.addEventListener('visibilitychange', onVisibility);

    // Respond to SW periodic sync messages when the app is open
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'HYDRATION_CHECK') check();
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);
}
