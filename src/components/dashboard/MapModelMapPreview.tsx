"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { ProjectModelLayer } from "@/components/map/ProjectModelLayer";
import { MapFallback } from "@/components/map/MapFallback";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { GeoPoint } from "@/lib/types";

/**
 * Admin's "3D Map Control" preview — the SAME Mapbox map (style, token,
 * `ProjectModelLayer` custom layer) that renders every other map in Rozaris
 * (MapView.tsx on the search page, StaticContextMap.tsx on listing/project
 * detail pages), centered on this project's real coordinates. Replaces the
 * old standalone Three.js grid preview (GlbPreviewCanvas) — what Admin sees
 * here, positioning scale/rotation/altitude against real streets and
 * terrain, is a WYSIWYG match for exactly what a visitor sees on the live
 * search map, not an abstract stand-in for it.
 */
export function MapModelMapPreview({
  coords,
  glbUrl,
  scale,
  rotationDeg,
  altitudeOffset,
  className,
}: {
  coords: GeoPoint;
  glbUrl: string | null;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const modelLayerRef = useRef<ProjectModelLayer | null>(null);
  const [ready, setReady] = useState(false);
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  const { t } = useT();

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token ? t("map.mapPreviewTokenHint") : null;
  const failReason = noTokenReason ?? webglFailReason;

  // --- Init once per mount ---
  useEffect(() => {
    if (!containerRef.current || noTokenReason || !token) return;
    if (!mapboxgl.supported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability only known client-side
      setWebglFailReason(t("map.noWebglShort"));
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/armalindokapaj/cms9jpj8b008x01s9g1fib0f7",
      center: [coords.lng, coords.lat],
      zoom: 17.5,
      pitch: 60,
      bearing: -20,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      const modelLayer = new ProjectModelLayer({ onPick: () => {} });
      map.addLayer(modelLayer);
      modelLayerRef.current = modelLayer;
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      modelLayerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- Recenter if the project itself changes (editor is reused across projects) ---
  useEffect(() => {
    mapRef.current?.jumpTo({ center: [coords.lng, coords.lat] });
  }, [coords.lat, coords.lng]);

  // --- Reconcile the one entry this preview ever shows ---
  useEffect(() => {
    if (!ready) return;
    modelLayerRef.current?.setEntries(
      glbUrl
        ? [
            {
              projectId: "preview",
              glbUrl,
              lng: coords.lng,
              lat: coords.lat,
              scale,
              rotationDeg,
              altitudeOffset,
            },
          ]
        : []
    );
  }, [ready, glbUrl, coords.lat, coords.lng, scale, rotationDeg, altitudeOffset]);

  if (failReason) {
    return (
      <div className={cn("h-full w-full overflow-hidden bg-neutral-100", className)}>
        <MapFallback reason={failReason} />
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!glbUrl && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="glass-panel-dark rounded-pill px-3.5 py-2 text-xs font-medium text-white">
            {t("admin.mapModelNoUpload")}
          </span>
        </div>
      )}
    </div>
  );
}
