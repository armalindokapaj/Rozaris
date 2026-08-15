"use client";

import { useCallback, useEffect, useState } from "react";

export interface RealPublisher {
  id: string;
  slug: string;
  name: string;
  type: string;
  phone: string;
  whatsapp: string | null;
  bio: string | null;
  verified: boolean;
  restricted: boolean;
  restrictedReason: string | null;
  restrictedUntil: string | null;
}

/** Every real Publisher row (`GET /api/admin/publishers`, admin-gated,
 * already covers every seeded + real publisher) — shared by PublishersTab
 * and VerificationTab so both search/refresh the same way instead of each
 * carrying its own near-identical fetch effect. */
export function useAdminPublishers(query: string) {
  const [publishers, setPublishers] = useState<RealPublisher[]>([]);

  const refresh = useCallback(() => {
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    fetch(`/api/admin/publishers${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RealPublisher[]) => setPublishers(rows))
      .catch(() => setPublishers([]));
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    fetch(`/api/admin/publishers${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: RealPublisher[]) => {
        if (!cancelled) setPublishers(rows);
      })
      .catch(() => {
        if (!cancelled) setPublishers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return { publishers, refresh };
}
