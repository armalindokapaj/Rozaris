"use client";

import { useCallback, useEffect, useRef } from "react";

export type TrackableEntity = "listing" | "project" | "ad";
export type TrackableEvent = "view" | "whatsapp_click" | "call_click" | "impression" | "click";

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
