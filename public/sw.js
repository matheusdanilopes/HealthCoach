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

// ── Push ────────────────────────────────────────────────────────────────────

self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { return; }

  const { title, body, icon, badge, tag, url } = payload;
  e.waitUntil(
    self.registration.showNotification(title || 'HealthCoach', {
      body: body || '',
      icon: icon || '/icons/icon-192x192.png',
      badge: badge || '/icons/icon-96x96.png',
      tag: tag || 'healthcoach',
      data: { url: url || '/' },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.focus();
          c.postMessage({ type: 'NOTIFICATION_CLICK', url: target });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// Renews subscription when the browser invalidates it
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => {
        const json = sub.toJSON();
        return fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      })
      .catch(() => {})
  );
});
