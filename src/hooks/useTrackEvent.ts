"use client";

import { useCallback, useEffect, useRef } from "react";

export type TrackableEntity = "listing" | "project" | "ad";
export type TrackableEvent = "view" | "whatsapp_click" | "call_click" | "impression" | "click";

/** Fires a `POST /api/analytics/track` beacon — see that route's doc
 * comment. `track()` is stable across renders so it's safe in a `useEffect`
 * dependency array without re-firing. */
export function useTrackEvent() {
  return useCallback((entityType: TrackableEntity, entityId: string, eventType: TrackableEvent) => {
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, eventType }),
      keepalive: true,
    }).catch(() => {});
  }, []);
}

/** Fires exactly one "view" event per mount, for a detail page's own
 * top-level component — guards against React StrictMode's dev-only
 * double-invoke double-counting a single real view. */
export function useTrackView(entityType: TrackableEntity, entityId: string) {
  const track = useTrackEvent();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(entityType, entityId, "view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);
}
