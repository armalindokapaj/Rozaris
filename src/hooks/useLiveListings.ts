"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Listing } from "@/lib/types";

let fetchPromise: Promise<Listing[]> | null = null;

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
