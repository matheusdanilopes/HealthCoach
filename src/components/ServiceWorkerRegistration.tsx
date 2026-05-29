'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        // Register periodic background sync for hydration reminders (Chrome Android)
        if ('periodicSync' in reg) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (reg as any).periodicSync.register('hc-hydration-check', {
              minInterval: 2 * 60 * 60 * 1000, // 2 hours minimum
            });
          } catch {
            // periodicSync not permitted yet (needs site engagement on Chrome)
          }
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
