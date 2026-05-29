'use client';

import { useEffect, useRef } from 'react';
import type { WaterLogEntry } from '@/types';

const COOLDOWN_MS        = 90 * 60 * 1000;  // 90 min between notifications
const MAX_DAILY          = 5;               // max browser notifications per day
const CHECK_INTERVAL_MS  = 10 * 60 * 1000; // check every 10 min while tab is open
const QUIET_START        = 22;             // no notifications 22:00–07:00
const QUIET_END          = 7;

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
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (isQuietHour()) return false;
  if (Date.now() - lastNotifTime() < COOLDOWN_MS) return false;
  if (dailyCount() >= MAX_DAILY) return false;
  return true;
}

function notify(title: string, body: string): void {
  if (!canNotify()) return;
  try {
    new Notification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: 'hc-hydration',
      silent: false,
    });
    saveNotifTime();
    bumpDailyCount();
    console.log('[hydration] Notification sent:', title);
  } catch (e) {
    console.warn('[hydration] Notification error:', e);
  }
}

export function useHydrationReminder(logs: WaterLogEntry[], target: number): void {
  const logsRef   = useRef(logs);
  const targetRef = useRef(target);

  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { targetRef.current = target; }, [target]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    function check(): void {
      const currentLogs   = logsRef.current;
      const currentTarget = targetRef.current;
      const total = currentLogs.reduce((s, l) => s + l.amount_ml, 0);

      if (isQuietHour()) return;

      const lastLog   = currentLogs.length > 0 ? currentLogs[currentLogs.length - 1] : null;
      const minSince  = lastLog
        ? Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 60_000)
        : 999;
      const pct = currentTarget > 0 ? total / currentTarget : 0;
      const h   = new Date().getHours();

      // Goal achieved — positive reinforcement (once per day)
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

      // > 2h without water
      if (minSince > 120) {
        const remaining = currentTarget - total;
        notify(
          'Hora de beber água 💧',
          `Você está há mais de 2h sem se hidratar. Faltam ${remaining}ml para sua meta.`,
        );
        return;
      }

      // Afternoon check: below 50% after 15h
      if (h >= 15 && pct < 0.5) {
        notify(
          'Seu consumo de água está baixo hoje 💧',
          `Você consumiu apenas ${Math.round(pct * 100)}% da sua meta diária.`,
        );
        return;
      }

      // Evening check: below 75% after 19h
      if (h >= 19 && pct < 0.75) {
        const remaining = currentTarget - total;
        notify(
          'Hidratação do dia quase completa 💧',
          `Ainda faltam ${remaining}ml para você completar a meta de hoje.`,
        );
      }
    }

    // Check on mount
    check();

    // Check every 10 min while tab is open
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    // Re-check when tab becomes visible again
    function onVisibility() { if (!document.hidden) check(); }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // stable: uses refs internally
}
