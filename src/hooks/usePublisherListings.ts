"use client";

import { useCallback, useEffect, useState } from "react";
import type { Listing } from "@/lib/types";

export interface UsePublisherListingsResult {
  /** This publisher's own listings — any status (pending/active/archived/
   * ...), unlike the public `/api/listings` GET which only returns
   * `active`. `null` while the initial GET is in flight. */
  listings: Listing[] | null;
  refresh: () => void;
  deleteListing: (id: string) => Promise<boolean>;
}

/**
 * The Business/Private Publisher dashboards' "my listings" data — real
 * Postgres rows (`GET /api/listings?publisherId=`), replacing the old
 * `mockData.listingsByPublisher()` (T0 of the platform audit's roadmap;
 * see the "Rozaris Platform Audit" memory).
 */
export function usePublisherListings(publisherId: string): UsePublisherListingsResult {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/listings?publisherId=${encodeURIComponent(publisherId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: Listing[] | null) => {
        if (!cancelled) setListings(rows);
      })
      .catch(() => {
        if (!cancelled) setListings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publisherId, refreshToken]);

  const deleteListing = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/listings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setListings((prev) => (prev ?? []).filter((l) => l.id !== id));
      return true;
    } catch (err) {
      console.error("usePublisherListings: delete failed", err);
      return false;
    }
  }, []);

  return { listings, refresh: () => setRefreshToken((t) => t + 1), deleteListing };
}
