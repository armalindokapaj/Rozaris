"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { ProjectModelLayer } from "@/components/map/ProjectModelLayer";
import { BuildingHider, type BuildingFootprint } from "@/components/map/BuildingHider";
import { MapFallback } from "@/components/map/MapFallback";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { GeoPoint } from "@/lib/types";

export interface HiddenBuildingEntry {
  lng: number;
  lat: number;
  footprint: BuildingFootprint | null;
  featureId?: string | number;
}

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
const POSITION_MARKER_COLOR = "#6b55f5"; // --color-brand-500

export function MapModelMapPreview({
  coords,
  modelPosition,
  glbUrl,
  scale,
  rotationDeg,
  altitudeOffset,
  hideBaseBuilding,
  hiddenBuildings,
  picking = false,
  onToggleBuilding,
  canMoveModel = false,
  onMoveModel,
  relocating = false,
  onRelocate,
  className,
}: {
  /** The project's own coordinates — only used to center/recenter the map,
   * independent of where the model itself is actually placed. */
  coords: GeoPoint;
  /** Where the GLB (and its draggable position handle) actually renders —
   * defaults to `coords` until Admin drags it elsewhere. */
  modelPosition: GeoPoint;
  glbUrl: string | null;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  hideBaseBuilding: boolean;
  /** Every real building Admin has picked to remove, each with its
   * footprint captured at pick time (see BuildingHider.ts). */
  hiddenBuildings: HiddenBuildingEntry[];
  /** True while Admin is actively picking — swaps the cursor to a
   * crosshair and turns map clicks into a building pick/toggle instead of
   * panning through to the underlying map controls. Stays true across
   * multiple picks; the caller decides when to turn it off. */
  picking?: boolean;
  onToggleBuilding?: (point: GeoPoint, feature: mapboxgl.MapboxGeoJSONFeature) => void;
  /** Shows a draggable position marker on the model's anchor point. */
  canMoveModel?: boolean;
  onMoveModel?: (point: GeoPoint) => void;
  /** True while Admin is in "Relocate position" mode — swaps the cursor to
   * a crosshair and turns the next map click into an instant "place the
   * model here" instead of requiring Admin to find and drag the (often
   * small, easy-to-miss) position marker handle. Same on/off shape as
   * `picking` above; the caller is responsible for keeping the two mutually
   * exclusive (both listen for plain map clicks). */
  relocating?: boolean;
  onRelocate?: (point: GeoPoint) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const modelLayerRef = useRef<ProjectModelLayer | null>(null);
  const buildingHiderRef = useRef<BuildingHider | null>(null);
  const positionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const onMoveModelRef = useRef(onMoveModel);
  useEffect(() => {
    onMoveModelRef.current = onMoveModel;
  }, [onMoveModel]);
  const onRelocateRef = useRef(onRelocate);
  useEffect(() => {
    onRelocateRef.current = onRelocate;
  }, [onRelocate]);
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
      style: "mapbox://styles/armalindokapaj/cmsqj4p0101ao01sd6911ckb4",
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

      // "Pick Buildings to Remove" highlight — a real footprint outline
      // (not a generic marker) so Admin sees exactly which building is
      // hovered/selected, drawn from the same feature geometry
      // BuildingHider queries to resolve a hide target.
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

      // Draggable "move the model" handle — a plain mapboxgl.Marker rather
      // than raycasting against the 3D model itself (ProjectModelLayer.ts
      // is shared with the live public map; keeping this purely in the
      // admin preview via the standard Marker API avoids touching it at
      // all). Position/visibility are reconciled by the effects below.
      const el = document.createElement("div");
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.borderRadius = "50%";
      el.style.border = "3px solid white";
      el.style.background = POSITION_MARKER_COLOR;
      el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
      el.style.cursor = "grab";
      const marker = new mapboxgl.Marker({ element: el, draggable: true });
      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        onMoveModelRef.current?.({ lng: lngLat.lng, lat: lngLat.lat });
      });
      positionMarkerRef.current = marker;

      setReady(true);
    });

    return () => {
      positionMarkerRef.current?.remove();
      positionMarkerRef.current = null;
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
              lng: modelPosition.lng,
              lat: modelPosition.lat,
              scale,
              rotationDeg,
              altitudeOffset,
            },
          ]
        : []
    );
  }, [ready, glbUrl, modelPosition.lat, modelPosition.lng, scale, rotationDeg, altitudeOffset]);

  // --- Position marker: shown whenever positioning is enabled — no longer
  // gated on `glbUrl` existing. "Move location first, then add the 3D
  // model" needs a real, visible marker to place BEFORE anything's been
  // uploaded, not just once a model is already sitting on the map. ---
  useEffect(() => {
    const map = mapRef.current;
    const marker = positionMarkerRef.current;
    if (!ready || !map || !marker) return;
    if (!canMoveModel) {
      marker.remove();
      return;
    }
    marker.setLngLat([modelPosition.lng, modelPosition.lat]);
    marker.addTo(map);
  }, [ready, canMoveModel, modelPosition.lat, modelPosition.lng]);

  const loadError = glbUrl != null && failedGlbUrl === glbUrl;

  useEffect(() => {
    if (!ready) return;
    buildingHiderRef.current?.setTargets(
      glbUrl && hideBaseBuilding
        ? hiddenBuildings.map((b, i) => ({ key: `preview-${i}`, lng: b.lng, lat: b.lat, footprint: b.footprint }))
        : []
    );
  }, [ready, glbUrl, hideBaseBuilding, hiddenBuildings]);

  function setHighlight(map: mapboxgl.Map, features: mapboxgl.MapboxGeoJSONFeature[]) {
    const source = map.getSource(PICK_HIGHLIGHT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: features.map((f) => ({ type: "Feature", geometry: f.geometry, properties: {} })),
    });
  }

  // --- "Pick Buildings to Remove": crosshair cursor + hover highlight +
  // click-to-toggle. Stays active across multiple picks (the caller turns
  // `picking` off explicitly, e.g. re-clicking the crosshair button). ---
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
      setHighlight(map, feature ? [feature] : []);
    }
    function onClick(e: mapboxgl.MapMouseEvent) {
      if (!map) return;
      const feature = buildingHiderRef.current?.queryBuildingFeatureAt(e.point);
      if (feature) onToggleBuilding?.({ lng: e.lngLat.lng, lat: e.lngLat.lat }, feature);
    }
    map.on("mousemove", onMouseMove);
    map.on("click", onClick);
    return () => {
      map.off("mousemove", onMouseMove);
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [ready, picking, onToggleBuilding]);

  // --- "Relocate position": crosshair cursor + click-anywhere-to-place, the
  // faster alternative to hunting down and dragging the small position
  // marker handle. Off by default; the caller (MapModelEditor) turns it on
  // via the "Relocate position" button and is responsible for keeping it
  // mutually exclusive with `picking` (both bind plain map clicks). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !relocating) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    function onClick(e: mapboxgl.MapMouseEvent) {
      onRelocateRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [ready, relocating]);

  // --- Persistent highlight on every currently-picked building, whenever
  // not actively picking ---
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || picking) return;
    if (!hideBaseBuilding || hiddenBuildings.length === 0) {
      setHighlight(map, []);
      return;
    }
    const features = hiddenBuildings
      .map((b) => {
        const point = map.project([b.lng, b.lat]);
        return buildingHiderRef.current?.queryBuildingFeatureAt(point) ?? null;
      })
      .filter((f): f is mapboxgl.MapboxGeoJSONFeature => f != null);
    setHighlight(map, features);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on the array's content via JSON below, not its identity
  }, [ready, picking, hideBaseBuilding, JSON.stringify(hiddenBuildings.map((b) => [b.lng, b.lat]))]);

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
      {relocating && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="glass-panel-dark rounded-pill px-3.5 py-2 text-xs font-medium text-white">
            {t("admin.mapModelRelocateHint")}
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
