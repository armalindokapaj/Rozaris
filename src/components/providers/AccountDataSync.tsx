"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { useStoreHydrated } from "@/hooks/useStoreHydrated";

/**
 * Account & Profile System PRD v1.0 — "User utility" phase. On the
 * transition into a signed-in session, fetches the real Postgres
 * saved/saved-searches/follows/recently-viewed rows and overwrites the
 * Zustand slices with them — same "server is the source of truth once
 * signed in" pattern `AuthSessionSync` already established for `auth`
 * itself. Guest browsing (signed out) keeps using the local-only slices
 * untouched, so nothing here changes anonymous behavior.
 *
 * Deliberately fetch-once-per-sign-in, not on every render: the store's
 * own toggle/add/remove actions (see accountApi.ts) already keep the
 * local slices in sync with the server after this point, so re-fetching
 * here would only be needed to pick up changes made from ANOTHER device —
 * out of scope for this pass.
 */
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
