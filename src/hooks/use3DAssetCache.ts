"use client";

import { useEffect } from "react";

export function use3DAssetCache(scope: "/project/" | "/embed/") {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw-3d-cache.js", { scope }).catch((err) => {
      console.warn("3D asset cache: Service Worker registration failed", err);
    });
  }, [scope]);
}
