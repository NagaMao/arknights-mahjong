/* static image cache for tiles and operator portraits */
const CACHE_PREFIX = 'ark-assets-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const IMAGE_PATHS = ['/tiles/', '/operators/'];

async function cacheManifest() {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const urls = await response.json();
    if (!Array.isArray(urls)) return;
    await Promise.all(
      urls.map(async (url) => {
        try {
          if (!(await cache.match(url))) {
            await cache.add(url);
          }
        } catch {
          // A missing optional image should not prevent the worker from installing.
        }
      }),
    );
  } catch {
    // Offline first install: images will still be cached as they are fetched.
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(cacheManifest());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_MANIFEST') {
    event.waitUntil(cacheManifest());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!IMAGE_PATHS.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
