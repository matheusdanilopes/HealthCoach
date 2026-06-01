'use client';

import type { WaterLogEntry } from '@/types';

// All hydration reminders are now sent exclusively by the backend scheduler
// (Vercel Cron → /api/notifications/run every 2 hours) via Web Push.
// This hook is preserved for import compatibility but performs no notification logic.
// Frontend timers, setInterval, and client-side push calls have been removed
// to prevent the "batch notifications on app open" symptom.
export function useHydrationReminder(
  _logs: WaterLogEntry[],
  _target: number,
  _mealHydrationMl = 0,
): void {
  // intentional no-op
}
