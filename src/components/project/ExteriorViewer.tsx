"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MapFallback } from "@/components/map/MapFallback";
import { COLORS } from "@/components/map/markerFactory";
import type { Project } from "@/lib/types";

/**
 * Exterior "shell" view for the dedicated ArchViz viewer (Section 11.1).
 *
 * Production note: this renders the project's real-world location using
 * Mapbox's 3D building extrusion (Standard style) as an honest stand-in for
 * a bespoke GLB/three.js ArchViz renderer, since no developer-supplied 3D
 * asset pipeline (Section 10) exists in this frontend-only prototype. The
 * component boundary here is intentional — swap this implementation for a
 * real model viewer without touching the unit-discovery flow around it.
 */
export function ExteriorViewer({
  project,
  className,
  onMapReady,
  onExploreUnits,
}: {
  project: Project;
  className?: string;
  onMapReady?: (map: mapboxgl.Map) => void;
  onExploreUnits?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token
    ? "Add a Mapbox access token to render the exterior model."
    : null;
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  const failReason = noTokenReason ?? webglFailReason;
  const [ready, setReady] = useState(false);

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
      center: [project.coords.lng, project.coords.lat],
      zoom: 17.4,
      pitch: 68,
      bearing: 28,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      setReady(true);
      onMapReady?.(map);
      const el = document.createElement("div");
      el.style.width = "26px";
      el.style.height = "26px";
      el.style.borderRadius = "50%";
      el.style.background = COLORS.newDev;
      el.style.border = "4px solid white";
      el.style.boxShadow = "0 0 0 6px rgba(139,92,246,0.25), 0 6px 16px rgba(0,0,0,0.35)";
      new mapboxgl.Marker({ element: el })
        .setLngLat([project.coords.lng, project.coords.lat])
        .addTo(map);

      // A single, deliberate settle-in — not continuous decorative motion
      // (Section 24.6) — and skipped entirely for prefers-reduced-motion.
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reducedMotion) {
        map.easeTo({ bearing: -8, duration: 2200, easing: (t) => t });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  if (failReason) {
    return (
      <div className={className}>
        <MapFallback
          reason={failReason}
          actionLabel="Browse available units"
          onAction={onExploreUnits}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
        </div>
      )}
    </div>
  );
}

export function resetExteriorView(map: mapboxgl.Map | null, project: Project) {
  if (!map) return;
  map.flyTo({
    center: [project.coords.lng, project.coords.lat],
    zoom: 17.4,
    pitch: 68,
    duration: 900,
  });
}
