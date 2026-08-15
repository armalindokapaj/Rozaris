"use client";

import { useEffect, useState } from "react";
import type { Publisher } from "@/lib/types";

export interface UsePublisherProfileResult {
  publisher: Publisher | null;
  loading: boolean;
  error: boolean;
}

/**
 * The signed-in publisher's own real Postgres `Publisher` row, via
 * `GET /api/business/organization` (session-scoped — the server resolves
 * the row from the session, never a client-supplied id). Replaces the old
 * `getPublisherById(auth.publisherId) ?? DEMO_PUBLISHER` lookup in
 * `/dashboard`, which silently fell back to the seed demo publisher for
 * any real signed-up publisher (their id was never in the hardcoded
 * `mockData.publishers` list) — see the launch-readiness audit that found
 * this.
 */
export function usePublisherProfile(enabled: boolean): UsePublisherProfileResult {
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Nothing to fetch (not signed in as a publisher) — the disabled state
    // is derived below at return time instead of reset here, so this
    // effect never calls setState synchronously on the disabled path.
    if (!enabled) return;
    let cancelled = false;
    // No explicit setLoading(true) here: `loading` already starts `true`
    // (see useState below), which covers both the initial mount and a
    // later sign-in — this effect only ever needs to flip it back to
    // `false` once the fetch settles, in the `finally` below.
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
