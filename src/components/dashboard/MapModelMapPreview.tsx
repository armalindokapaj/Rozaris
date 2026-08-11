"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { ProjectModelLayer } from "@/components/map/ProjectModelLayer";
import { BuildingHider } from "@/components/map/BuildingHider";
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
const PICK_HIGHLIGHT_SOURCE = "pick-building-highlight";

export function MapModelMapPreview({
  coords,
  glbUrl,
  scale,
  rotationDeg,
  altitudeOffset,
  hideBaseBuilding,
  hiddenBuildingPoint,
  picking = false,
  onPickBuilding,
  className,
}: {
  coords: GeoPoint;
  glbUrl: string | null;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  hideBaseBuilding: boolean;
  /** Manually picked anchor point (from "Pick Building to Remove"), or null
   * to fall back to `coords`. */
  hiddenBuildingPoint?: GeoPoint | null;
  /** True while Admin is actively picking — swaps the cursor to a
   * crosshair and turns map clicks into a building selection instead of
   * panning through to the underlying map controls. */
  picking?: boolean;
  onPickBuilding?: (point: GeoPoint) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const modelLayerRef = useRef<ProjectModelLayer | null>(null);
  const buildingHiderRef = useRef<BuildingHider | null>(null);
  const [ready, setReady] = useState(false);
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  // Tracks which glbUrl (if any) last failed to load. Deriving `loadError`
  // from this instead of a separate boolean means a new glbUrl clears the
  // old error for free — no explicit reset needed in the reconcile effect
  // below, which would otherwise be a setState called directly in an
  // effect body.
  const [failedGlbUrl, setFailedGlbUrl] = useState<string | null>(null);
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
      const modelLayer = new ProjectModelLayer({
        onPick: () => {},
        onLoadError: (_projectId, error, url) => {
          console.error("3D Map Control: failed to load GLB", error);
          setFailedGlbUrl(url);
        },
      });
      map.addLayer(modelLayer);
      modelLayerRef.current = modelLayer;
      buildingHiderRef.current = new BuildingHider(map);

      // "Pick Building to Remove" highlight — a real footprint outline (not
      // a generic marker) so Admin sees exactly which building is hovered/
      // selected, drawn from the same feature geometry BuildingHider queries
      // to resolve a hide target.
      map.addSource(PICK_HIGHLIGHT_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: `${PICK_HIGHLIGHT_SOURCE}-fill`,
        type: "fill",
        source: PICK_HIGHLIGHT_SOURCE,
        paint: { "fill-color": "#6b55f5", "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: `${PICK_HIGHLIGHT_SOURCE}-line`,
        type: "line",
        source: PICK_HIGHLIGHT_SOURCE,
        paint: { "line-color": "#6b55f5", "line-width": 3 },
      });

      setReady(true);
    });

    return () => {
      buildingHiderRef.current?.destroy();
      buildingHiderRef.current = null;
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

  const loadError = glbUrl != null && failedGlbUrl === glbUrl;
  const anchor = hiddenBuildingPoint ?? coords;

  useEffect(() => {
    if (!ready) return;
    buildingHiderRef.current?.setTargets(
      glbUrl && hideBaseBuilding ? [{ key: "preview", lng: anchor.lng, lat: anchor.lat }] : []
    );
  }, [ready, glbUrl, hideBaseBuilding, anchor.lat, anchor.lng]);

  function setHighlight(map: mapboxgl.Map, feature: mapboxgl.MapboxGeoJSONFeature | null) {
    const source = map.getSource(PICK_HIGHLIGHT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: feature ? [{ type: "Feature", geometry: feature.geometry, properties: {} }] : [],
    });
  }

  // --- "Pick Building to Remove": crosshair cursor + hover highlight + click-to-select ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const canvas = map.getCanvas();

    if (!picking) {
      canvas.style.cursor = "";
      return;
    }
    canvas.style.cursor = "crosshair";

    function onMouseMove(e: mapboxgl.MapMouseEvent) {
      if (!map) return;
      const feature = buildingHiderRef.current?.queryBuildingFeatureAt(e.point) ?? null;
      setHighlight(map, feature);
    }
    function onClick(e: mapboxgl.MapMouseEvent) {
      if (!map) return;
      const feature = buildingHiderRef.current?.queryBuildingFeatureAt(e.point);
      if (feature) onPickBuilding?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
    map.on("mousemove", onMouseMove);
    map.on("click", onClick);
    return () => {
      map.off("mousemove", onMouseMove);
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [ready, picking, onPickBuilding]);

  // --- Persistent highlight on the currently-picked building, whenever not actively picking ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || picking) return;
    if (!hideBaseBuilding || !hiddenBuildingPoint) {
      setHighlight(map, null);
      return;
    }
    const point = map.project([hiddenBuildingPoint.lng, hiddenBuildingPoint.lat]);
    const feature = buildingHiderRef.current?.queryBuildingFeatureAt(point) ?? null;
    setHighlight(map, feature);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on primitives, not the possibly-new-identity point object
  }, [ready, picking, hideBaseBuilding, hiddenBuildingPoint?.lat, hiddenBuildingPoint?.lng]);

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
      {picking && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="glass-panel-dark rounded-pill px-3.5 py-2 text-xs font-medium text-white">
            {t("admin.mapModelPickHint")}
          </span>
        </div>
      )}
      {!glbUrl && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="glass-panel-dark rounded-pill px-3.5 py-2 text-xs font-medium text-white">
            {t("admin.mapModelNoUpload")}
          </span>
        </div>
      )}
      {loadError && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-pill bg-red-600/90 px-3.5 py-2 text-xs font-medium text-white shadow-[var(--shadow-2)]">
            {t("admin.mapModelLoadError")}
          </span>
        </div>
      )}
    </div>
  );
}
