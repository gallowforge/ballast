/* Ledger service worker. Every built file is precached on install, so the whole app works
   offline from the first visit. Pages and assets are served from the cache first; a new deploy
   installs in the background and takes over when the page asks (the "Update ready" prompt). */
const VERSION = '__VERSION__';
const PRECACHE = [/* __PRECACHE__ */];
const CACHE = `ledger-${VERSION}`;
const scope = self.registration.scope;
const OFFLINE = new URL('offline/', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE.map(async (path) => {
          const url = new URL(path, scope).href;
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) await cache.put(url, res);
        }),
      );
      // The very first install has nothing to replace, so it can take over straight away.
      if (!self.registration.active) await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ledger-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

function pageKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  if (!u.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += '/';
  return u.href;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !request.url.startsWith(scope)) return;
  const isPage =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html') ||
    !/\.[a-z0-9]+$/i.test(url.pathname);

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = isPage ? pageKey(request.url) : request.url;
      const hit = await cache.match(key);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok && !isPage) cache.put(request, res.clone());
        return res;
      } catch (err) {
        if (isPage) return (await cache.match(OFFLINE)) || Response.error();
        throw err;
      }
    })(),
  );
});
