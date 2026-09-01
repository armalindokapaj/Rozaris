// Cache-first is only correct because every cached URL is content-immutable:
// Blob uploads all use addRandomSuffix and the manifest is keyed by releaseId.
// The page document uses stale-while-revalidate instead, since a deploy changes it.
const SHELL_CACHE = "rozaris-3d-shell-v1";
const ASSET_CACHE = "rozaris-3d-assets-v2";
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

const SHELL_MAX_ENTRIES = 200;
const ASSET_MAX_ENTRIES = 80;

const IS_LOCAL_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("rozaris-3d-") && !CURRENT_CACHES.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

function shouldCacheAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);

  if (url.hostname.endsWith(".public.blob.vercel-storage.com")) return true;

  if (/^\/api\/viewer\/v1\/t\/[^/]+\/manifest\/[^/]+$/.test(url.pathname)) return true;

  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/textures/") || url.pathname.startsWith("/luts/"))
  ) {
    return true;
  }

  return false;
}

function isShellBuildAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const overBy = keys.length - maxEntries;
  if (overBy <= 0) return;
  await Promise.all(keys.slice(0, overBy).map((key) => cache.delete(key)));
}

async function cacheFirst(event, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;

  const response = await fetch(event.request);

  if (response.ok && response.type !== "opaque") {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trimCache(cache, maxEntries)));
  }

  return response;
}

async function staleWhileRevalidate(event, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);

  const networkUpdate = fetch(event.request)
    .then((response) => {
      if (response.ok && response.type !== "opaque") {
        const copy = response.clone();
        cache.put(event.request, copy).then(() => trimCache(cache, maxEntries));
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkUpdate);
    return cached;
  }

  const response = await networkUpdate;
  if (!response) throw new Error("Network request failed and nothing was cached");
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (!IS_LOCAL_DEV) {
    if (request.mode === "navigate") {
      event.respondWith(staleWhileRevalidate(event, SHELL_CACHE, SHELL_MAX_ENTRIES));
      return;
    }
    if (isShellBuildAsset(request)) {
      event.respondWith(cacheFirst(event, SHELL_CACHE, SHELL_MAX_ENTRIES));
      return;
    }
  }

  if (shouldCacheAsset(request)) {
    event.respondWith(cacheFirst(event, ASSET_CACHE, ASSET_MAX_ENTRIES));
  }
});
