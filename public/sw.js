const CACHE = 'hc-v5';

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

// Handle push notifications from server (VAPID)
self.addEventListener('push', e => {
  let data = { title: 'HealthCoach', body: 'Você tem uma nova notificação.', tag: 'hc-general' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch { /**/ }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:   data.body,
      icon:   '/icons/icon-192x192.png',
      badge:  '/icons/icon-96x96.png',
      tag:    data.tag ?? 'hc-general',
      data:   data,
    })
  );
});

// Handle notification tap — open or focus the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/dashboard';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('/dashboard') && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// Periodic background sync — Chrome Android
self.addEventListener('periodicsync', e => {
  if (e.tag === 'hc-hydration-check') {
    e.waitUntil(
      // Just show a gentle reminder if the sync fires
      self.registration.showNotification('Hora de beber água 💧', {
        body:  'Não esqueça de se hidratar!',
        icon:  '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag:   'hc-hydration',
      })
    );
  }
});
