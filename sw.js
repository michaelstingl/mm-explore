// Service Worker for M+M Explore
// Version bumps invalidate shell cache on deploy.
const VERSION = 'v1-2026-04-22-c';
const SHELL_CACHE = `mm-shell-${VERSION}`;
const GIST_CACHE = `mm-gist-${VERSION}`;
const MANIFEST_STATE = `mm-manifest-state-${VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icon-source.svg',
  'https://unpkg.com/open-props/open-props.min.css',
  'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== GIST_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Dev-server live-reload WebSocket — bypass
  if (url.pathname === '/__reload') return;

  // manifest.json: rewrite start_url to include current gist query param
  // This is crucial for iOS "Add to Home Screen" to capture the gist URL.
  if (url.pathname.endsWith('/manifest.json')) {
    event.respondWith((async () => {
      const baseResponse = await fetch(event.request).catch(() => caches.match(event.request));
      if (!baseResponse) return new Response('{}', { headers: { 'Content-Type': 'application/manifest+json' } });
      const manifest = await baseResponse.json();
      // Look up which ?gist= was active when the client loaded this page
      const clientId = event.clientId || event.resultingClientId;
      let gistForStart = null;
      if (clientId) {
        const client = await self.clients.get(clientId);
        if (client) {
          try {
            const clientUrl = new URL(client.url);
            gistForStart = clientUrl.searchParams.get('gist');
          } catch {}
        }
      }
      if (gistForStart) {
        manifest.start_url = `./?gist=${encodeURIComponent(gistForStart)}`;
      }
      return new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' }
      });
    })());
    return;
  }

  // Gist raw data: network-first, fall back to cache
  if (url.hostname === 'gist.githubusercontent.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(GIST_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || new Response('Offline and no cache', { status: 503 })))
    );
    return;
  }

  // Everything else: cache-first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && (url.origin === self.location.origin || url.hostname === 'unpkg.com')) {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});

// Allow page to trigger skipWaiting on update prompt
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
