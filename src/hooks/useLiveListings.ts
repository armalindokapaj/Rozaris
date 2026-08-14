"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

/**
 * Triggers the one-time fetch of `GET /api/listings` into the shared
 * `liveListings` store slice. Safe to call from multiple mount points
 * (`/search`, `/buyer/dashboard`, ...) — guards on `liveListings`/
 * `liveListingsLoading` already being set so a visitor who lands directly
 * on a page other than `/search` still gets real data without a second,
 * redundant request once one is already in flight or done.
 */
export function useLiveListings() {
  const liveListings = useAppStore((s) => s.liveListings);
  const liveListingsLoading = useAppStore((s) => s.liveListingsLoading);
  const setLiveListings = useAppStore((s) => s.setLiveListings);
  const setLiveListingsLoading = useAppStore((s) => s.setLiveListingsLoading);

  useEffect(() => {
    if (liveListings !== null || liveListingsLoading) return;
    let cancelled = false;
    setLiveListingsLoading(true);
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancelled) setLiveListings(rows);
      })
      .catch(() => {
        if (!cancelled) setLiveListings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [liveListings, liveListingsLoading, setLiveListings, setLiveListingsLoading]);
}
