"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

/**
 * Module-level (not React state) in-flight cache — see the identical,
 * more-detailed comment on `useLiveProjects.ts`'s own `fetchPromise` for
 * why this lives outside the store rather than being deduped via a
 * `liveListingsLoading` boolean in the effect's dependency array (that
 * shape caused a real "Maximum update depth exceeded" loop, found live).
 */
let fetchPromise: Promise<Listing[]> | null = null;

/**
 * Triggers the one-time fetch of `GET /api/listings` into the shared
 * `liveListings` store slice. Safe to call from multiple mount points
 * (`/search`, `/buyer/dashboard`, ...) — the module-level cache above
 * means a visitor who lands directly on a page other than `/search` still
 * gets real data without a second, redundant request once one is already
 * in flight or done.
 */
export function useLiveListings() {
  const liveListings = useAppStore((s) => s.liveListings);
  const setLiveListings = useAppStore((s) => s.setLiveListings);
  const setLiveListingsLoading = useAppStore((s) => s.setLiveListingsLoading);

  useEffect(() => {
    if (liveListings !== null) return;
    if (!fetchPromise) {
      setLiveListingsLoading(true);
      fetchPromise = fetch("/api/listings")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    let cancelled = false;
    fetchPromise.then((rows) => {
      if (cancelled) return;
      setLiveListings(rows);
      setLiveListingsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [liveListings, setLiveListings, setLiveListingsLoading]);
}
