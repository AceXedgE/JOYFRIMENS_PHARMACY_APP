const CACHE_PREFIX = 'joyfrimens-shell-';
const CACHE = `${CACHE_PREFIX}__BUILD_ID__`;
const SHELL = /* __PRECACHE_URLS__ */;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Installation fails if any required asset is unavailable. Keep the previous
    // worker until the complete new shell is ready and all old windows close.
    await cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  // Only cache build assets. Never cache API responses or private supplier URLs.
  const navigation = event.request.mode === 'navigate' && ['/', '/supplier', '/index.html'].includes(url.pathname);
  if (!navigation && (!SHELL.includes(url.pathname) || url.search)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(navigation ? '/' : url.pathname);
    return saved ?? fetch(event.request);
  })());
});
