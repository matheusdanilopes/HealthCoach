const CACHE = 'hc-v6';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const { pathname } = new URL(e.request.url);
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || fresh;
    })
  );
});

// Push from server (VAPID)
self.addEventListener('push', e => {
  const defaults = { title: 'HealthCoach', body: 'Você tem uma nova notificação.', tag: 'hc-general', url: '/dashboard' };
  let data = defaults;
  try { if (e.data) data = { ...defaults, ...e.data.json() }; } catch { /**/ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     '/icons/icon-192x192.png',
      badge:    '/icons/icon-96x96.png',
      tag:      data.tag ?? 'hc-general',
      renotify: true,
      vibrate:  [100, 50, 100],
      data:     { url: data.url ?? '/dashboard' },
    })
  );
});

// Notification tap — open the URL carried in notification data
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/dashboard';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Navigate an existing window if one is open
      const existing = list.find(c => 'navigate' in c);
      if (existing) return existing.navigate(url);
      return clients.openWindow(url);
    })
  );
});

// Auto-resubscribe when browser rotates the push subscription
self.addEventListener('pushsubscriptionchange', e => {
  const appKey = e.oldSubscription?.options?.applicationServerKey;
  if (!appKey) return;

  e.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
      .then(sub => {
        const json = sub.toJSON();
        return fetch('/api/notifications/subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(json),
        });
      })
      .then(res => { if (!res.ok) throw new Error('subscribe failed ' + res.status); })
      .catch(err => console.error('[sw] pushsubscriptionchange resubscribe failed:', err))
  );
});

// Periodic background sync — Chrome Android only
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'hc-hydration-check') return;

  e.waitUntil((async () => {
    // Respect quiet hours using local device time
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 7) return;

    // If the app is open, let the client-side hook handle it
    const openWindows = await clients.matchAll({ type: 'window' });
    if (openWindows.length > 0) {
      openWindows.forEach(c => c.postMessage({ type: 'HYDRATION_CHECK' }));
      return;
    }

    // App is closed — show a gentle offline reminder
    await self.registration.showNotification('Hora de beber água 💧', {
      body:     'Não esqueça de se hidratar!',
      icon:     '/icons/icon-192x192.png',
      badge:    '/icons/icon-96x96.png',
      tag:      'hc-hydration',
      renotify: true,
      vibrate:  [100, 50, 100],
      data:     { url: '/dashboard' },
    });
  })());
});
