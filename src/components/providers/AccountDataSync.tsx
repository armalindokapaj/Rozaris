"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { useStoreHydrated } from "@/hooks/useStoreHydrated";

export function AccountDataSync() {
  const hydrated = useStoreHydrated();
  const signedIn = useAppStore((s) => s.auth.signedIn);
  const hydrateSaved = useAppStore((s) => s.hydrateSaved);
  const hydrateSavedSearches = useAppStore((s) => s.hydrateSavedSearches);
  const hydrateFollowing = useAppStore((s) => s.hydrateFollowing);
  const hydrateRecentlyViewed = useAppStore((s) => s.hydrateRecentlyViewed);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!signedIn) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    fetch("/api/account/saved")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && hydrateSaved(data))
      .catch(() => {});
    fetch("/api/account/saved-searches")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && hydrateSavedSearches(data))
      .catch(() => {});
    fetch("/api/account/follows")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && hydrateFollowing(data))
      .catch(() => {});
    fetch("/api/account/recently-viewed")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && hydrateRecentlyViewed(data))
      .catch(() => {});
  }, [hydrated, signedIn, hydrateSaved, hydrateSavedSearches, hydrateFollowing, hydrateRecentlyViewed]);

  return null;
}
