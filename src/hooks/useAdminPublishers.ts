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
