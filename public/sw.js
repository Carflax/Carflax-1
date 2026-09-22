// Service Worker — Carflax Hub (PWA: cache + Web Push)

const CACHE = 'carflax-hub-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.png'];

// Caminhos dinâmicos (dados ao vivo) que NUNCA devem ser cacheados.
const NO_CACHE = [
  '/api-marketing',
  '/api-campaign',
  // Catálogo da loja: é leitura ao vivo e passa por proxy same-origin, então sem
  // esta linha cai no stale-while-revalidate abaixo e a tela de Produtos passa a
  // comparar o ERP com um catálogo de meses atrás.
  '/shopify-api',
  '/secullum-auth',
  '/secullum-api',
  '/supabase',
  '/rest/',
  '/auth/',
  '/realtime',
  '/storage/',
];

// ── Instalação: pré-cacheia o app shell ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// ── Ativação: limpa caches antigos ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNoCache(url) {
  return NO_CACHE.some((p) => url.pathname.startsWith(p));
}

// ── Fetch: estratégias de cache ──────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Só mexemos em same-origin. APIs/dados dinâmicos passam direto (rede).
  if (url.origin !== self.location.origin || isNoCache(url)) return;

  // Navegações (SPA): network-first, com fallback para o index cacheado (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate (rápido e atualiza em segundo plano).
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ── Web Push (mantido) ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  // `urgente` (cliente que o Carlinhos passou para o vendedor): o aviso não some
  // sozinho, vibra no celular e tem botão para abrir a conversa.
  const urgente = !!data.urgente;
  // `url` (liberação do Gestor): o toque abre essa página, não uma seção do HUB.
  const url = data.url || null;
  event.waitUntil(
    self.registration.showNotification(data.title || '💬 Nova mensagem', {
      body: data.body || '',
      icon: data.icon || '/favicon.png',
      badge: '/favicon.png',
      tag: data.tag || 'carflax-push',
      renotify: true,
      requireInteraction: urgente,
      vibrate: urgente ? [300, 100, 300, 100, 300] : undefined,
      actions: urgente ? [{ action: 'abrir', title: url ? 'Abrir' : 'Abrir conversa' }] : undefined,
      data: { section: data.section || 'Marketing', documento: data.documento, remote_jid: data.remote_jid, url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const section = event.notification.data?.section || 'Marketing';
  const documento = event.notification.data?.documento;
  const remoteJid = event.notification.data?.remote_jid;
  const url = event.notification.data?.url;

  // Aviso com página própria (Gestor): foca uma janela que já esteja nela e
  // manda abrir as liberações; se não houver, abre a página (no celular com o
  // Gestor instalado, abre o app).
  if (url) {
    const destino = new URL(url, self.location.origin);
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).pathname.startsWith(destino.pathname) && 'focus' in client) {
            client.focus();
            client.postMessage({ type: 'carflax-abrir-url', url });
            return;
          }
        }
        return clients.openWindow(destino.href);
      })
    );
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'carflax-navigate', section });
          if (documento) {
            client.postMessage({ type: 'carflax-open-chat', documento });
          }
          if (remoteJid) {
            client.postMessage({ type: 'carflax-open-whatsapp', remoteJid });
          }
          return;
        }
      }
      return clients.openWindow('/');
    })
  );
});
