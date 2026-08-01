"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MapFallback } from "./MapFallback";
import { COLORS } from "./markerFactory";
import { cn } from "@/lib/utils";
import type { GeoPoint } from "@/lib/types";

/** Lightweight, single-marker map used for listing/project "building context" panels. */
export function StaticContextMap({
  center,
  className,
  markerColor = COLORS.selected,
  zoom = 16,
}: {
  center: GeoPoint;
  className?: string;
  markerColor?: string;
  zoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token ? "Map preview requires a Mapbox access token." : null;
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  const failReason = noTokenReason ?? webglFailReason;

  useEffect(() => {
    if (!containerRef.current || noTokenReason || !token) return;
    if (!mapboxgl.supported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability only known client-side
      setWebglFailReason("Your browser does not support WebGL.");
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [center.lng, center.lat],
      zoom,
      pitch: 45,
      bearing: -10,
      interactive: true,
      attributionControl: false,
    });

    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    el.style.background = markerColor;
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 0 0 4px rgba(109,91,246,0.25), 0 4px 10px rgba(0,0,0,0.3)";
    new mapboxgl.Marker({ element: el }).setLngLat([center.lng, center.lat]).addTo(map);
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failReason) {
    return (
      <div className={cn("overflow-hidden rounded-panel", className)}>
        <MapFallback reason={failReason} />
      </div>
    );
  }

  return <div ref={containerRef} className={cn("overflow-hidden rounded-panel", className)} />;
}
