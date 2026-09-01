"use client";

import { useEffect, useState } from "react";
import type { Publisher } from "@/lib/types";

export interface UsePublisherProfileResult {
  publisher: Publisher | null;
  loading: boolean;
  error: boolean;
}

export function usePublisherProfile(enabled: boolean): UsePublisherProfileResult {
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/business/organization")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Publisher) => {
        if (cancelled) return;
        setPublisher(data);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPublisher(null);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    publisher: enabled ? publisher : null,
    loading: enabled ? loading : false,
    error: enabled ? error : false,
  };
}
