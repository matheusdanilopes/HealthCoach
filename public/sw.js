// Trocar a versão apaga o cache antigo na ativação (o hc-v9 guardava dados
// de páginas da navegação e servia versões velhas).
const CACHE = 'hc-v10';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;
  // Dados da navegação do Next (RSC): são da pessoa e mudam a cada registro.
  // Nunca do cache — uma cópia velha fazia a tela da Nina abrir sem a
  // conversa atual (e a próxima pergunta virava outra conversa).
  if (url.searchParams.has('_rsc') || req.headers.get('RSC') === '1') return;

  // Páginas: sempre da rede; o cache só serve quando está sem internet.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || Response.error()))
    );
    return;
  }

  // Ícones, splash e manifest: cache primeiro, atualizando em segundo plano.
  e.respondWith(
    caches.match(req).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
      if (!cached) return fresh;
      fresh.catch(() => {}); // sem rede: fica a cópia do cache
      return cached;
    })
  );
});
