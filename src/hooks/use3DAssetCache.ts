"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw-3d-cache.js` scoped to exactly one of the two
 * `ProjectViewerRuntime` route trees — `/project/` (marketplace) or
 * `/embed/` (white-label) — so a reload or reopen of a project the
 * browser has already visited skips the network entirely: the page
 * document itself, its JS/CSS chunks, and its GLBs/textures/manifest all
 * come straight from the Service Worker's own Cache Storage instead of
 * relying on the ordinary HTTP disk cache (which evicts large assets
 * under storage pressure and doesn't survive "clear browsing data").
 * Never registered anywhere else on the site — admin, dashboard, and
 * every other page stay untouched. See `sw-3d-cache.js`'s own doc
 * comment for exactly what it caches, with what strategy, and why each
 * choice is safe there.
 */
export function use3DAssetCache(scope: "/project/" | "/embed/") {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw-3d-cache.js", { scope }).catch((err) => {
      // Best-effort speed-up, not a functional requirement — a
      // registration failure (unsupported browser, a privacy extension
      // blocking Service Workers, etc.) should never break the viewer.
      console.warn("3D asset cache: Service Worker registration failed", err);
    });
  }, [scope]);
}
