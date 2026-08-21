/**
 * Rozaris 3D asset cache — a cache-first Service Worker for the two
 * viewer surfaces that share `ProjectViewerRuntime`: the marketplace
 * `/project/[slug]` viewer and the white-label `/embed/[publicKey]`
 * viewer. It's registered with an explicit `scope` from
 * `use3DAssetCache.ts` for each of those two route trees only — no other
 * page on the site (landing, dashboard, admin 3D editor) ever has this
 * Service Worker controlling it, so nothing there needs to reason about
 * caching stale content while an admin is actively editing.
 *
 * Two independent caches, because "safe to cache-first forever" and
 * "safe to cache at all" are different questions for the two things this
 * worker stores:
 *
 * ASSET_CACHE — GLBs, backdrop panoramas, ad photos, map models (any
 * Vercel Blob URL), the white-label manifest, and small static render
 * assets (`/textures/`, `/luts/`). Pure cache-first, no revalidation,
 * because every one of these URLs is already content-immutable by
 * construction: Blob uploads all use `addRandomSuffix: true` (see
 * `detail-models/.../versions/route.ts` and `api/blob/upload/route.ts`)
 * and the manifest route is keyed by `releaseId` in its own path. A
 * cache HIT is therefore always correct — this is the actual weight of
 * a project (tens of MB of GLBs), so it's the main win for "don't
 * re-download a project I've already opened."
 *
 * SHELL_CACHE — the page document itself (so a reload/reopen doesn't
 * wait on the network at all) plus its `/_next/static/` JS/CSS chunks
 * (build-hashed, so also genuinely immutable). Unlike the asset cache,
 * the *document* response isn't immutable — a new deploy changes it —
 * so this uses stale-while-revalidate: serve whatever's cached
 * instantly, and refetch in the background to update the cache for next
 * time. That trades "always byte-for-byte current" for "never makes the
 * visitor wait," which is the right trade for a page whose genuinely
 * live parts (units/inventory/config) are already fetched client-side
 * through separate, uncached API routes — see `shouldCacheAsset` below
 * for the deliberately short list of what this worker will ever touch;
 * everything else (`/api/project-3d-config`, `/api/viewer/.../inventory`,
 * `/api/viewer/.../bootstrap`, any POST/PUT/PATCH/DELETE) is untouched
 * on purpose and always hits the network.
 *
 * Shell caching is skipped entirely on localhost — see IS_LOCAL_DEV —
 * so a Service Worker registered while developing never masks a code
 * change behind a stale cached document during Fast Refresh iteration.
 */

const SHELL_CACHE = "rozaris-3d-shell-v1";
const ASSET_CACHE = "rozaris-3d-assets-v2";
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

// The shell cache holds many small entries (one document + a few dozen JS/
// CSS chunks per distinct project visited); the asset cache holds few but
// huge ones (GLBs/panoramas), so each gets its own budget. Insertion-order
// eviction (oldest entries added go first) approximates LRU well enough
// here since a revisit reads from cache without re-inserting, so genuinely
// "hot" entries stay young.
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

  // Any Vercel Blob-hosted asset — GLBs, backdrop panoramas, ad photos,
  // map models. Always content-versioned via addRandomSuffix, so the
  // hostname alone is enough to know a hit is safe, regardless of path.
  if (url.hostname.endsWith(".public.blob.vercel-storage.com")) return true;

  // Same-origin white-label manifest — versioned by releaseId in the
  // path itself, already served as immutable by its own route.
  if (/^\/api\/viewer\/v1\/t\/[^/]+\/manifest\/[^/]+$/.test(url.pathname)) return true;

  // Small static render assets (water normal map, LUT files) — part of
  // the deployed build, effectively immutable between deploys.
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

  // Only persist genuinely successful, readable responses. `opaque`
  // (status 0) would mean the request somehow went out as no-cors —
  // shouldn't happen here since these are all normal cors-mode
  // fetches, but caching an opaque response would mean caching a blob
  // we can't actually inspect the status of, so skip it defensively.
  if (response.ok && response.type !== "opaque") {
    const copy = response.clone();
    // Don't make the page wait on the cache write — hand back the real
    // network response immediately, and keep the worker alive just long
    // enough in the background to finish writing + trimming the cache.
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
    .catch(() => null); // offline/network failure is fine as long as `cached` exists

  if (cached) {
    // Serve the last-known version with zero wait — this is what makes a
    // reload/reopen instant — while the network refetch above updates the
    // cache in the background for the *next* visit. Deliberately not
    // awaited here: the visitor's request must not block on it.
    event.waitUntil(networkUpdate);
    return cached;
  }

  // First-ever visit to this project on this device — nothing to serve
  // instantly yet, so this one request has to wait on the network like a
  // normal (uncached) load.
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
