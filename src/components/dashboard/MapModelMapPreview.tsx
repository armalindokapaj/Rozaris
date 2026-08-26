"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { ProjectModelSource } from "@/components/map/ProjectModelSource";
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
 * `ProjectModelSource` native `model` layers) that renders the public
 * search map (MapView.tsx), centered on this project's real coordinates.
 * Replaces the old standalone Three.js preview (GlbPreviewCanvas) — what Admin sees
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
  /** Where the map is centred. ONE LOCATION — this and `modelPosition`
   * are now the same value (the project's site coordinates); they stayed
   * separate props because the camera and the model reconcile on different
   * effects, and the camera deliberately holds still for a move the user
   * made here (see `selfMovedRef`). */
  coords: GeoPoint;
  /** Where the GLB and its draggable handle render — the project's own
   * coordinates. Dragging the handle moves the PROJECT, not a model offset
   * of its own; see src/lib/projectLocation.ts. */
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
  const modelLayerRef = useRef<ProjectModelSource | null>(null);
  const buildingHiderRef = useRef<BuildingHider | null>(null);
  const positionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // The last point this preview itself reported upward. `coords` is now
  // the project's ONE location (src/lib/projectLocation.ts), so it comes
  // straight back down as a prop the moment Admin drags the marker — and
  // the recenter effect below would then `jumpTo` on every drag, yanking
  // the camera out from under the gesture. A change that matches this ref
  // is our own echo and must not move the camera; anything else (the
  // lat/lng fields, "use neighbourhood centre", a different project) is
  // external and should.
  const selfMovedRef = useRef<GeoPoint | null>(null);
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
      modelLayerRef.current = new ProjectModelSource(map, {
        onPick: () => {},
        onLoadError: (_projectId, error, url) => {
          console.error("3D Map Control: failed to load GLB", error);
          setFailedGlbUrl(url);
        },
        // Admin drags the position marker and clicks to pick buildings on
        // this very map — a proximity "close enough to the model" pick
        // would hijack those gestures. Require a real geometry hit; there
        // is nothing to open from the preview anyway (`onPick` is a no-op).
        pickFallbackPx: 0,
      });
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
      // than hit-testing the 3D model itself (ProjectModelSource.ts is
      // shared with the live public map; keeping this purely in the admin
      // preview via the standard Marker API avoids touching it at all).
      // Position/visibility are reconciled by the effects below.
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
        const point = { lng: lngLat.lng, lat: lngLat.lat };
        selfMovedRef.current = point;
        onMoveModelRef.current?.(point);
      });
      positionMarkerRef.current = marker;

      setReady(true);
    });

    return () => {
      positionMarkerRef.current?.remove();
      positionMarkerRef.current = null;
      buildingHiderRef.current?.destroy();
      buildingHiderRef.current = null;
      modelLayerRef.current?.destroy();
      modelLayerRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- Recenter when the location changed from OUTSIDE this map (a
  // different project, a typed coordinate, a neighbourhood-centre reset).
  // See `selfMovedRef` for why a drag/relocate of our own marker is
  // deliberately excluded. ---
  useEffect(() => {
    const self = selfMovedRef.current;
    if (self && self.lat === coords.lat && self.lng === coords.lng) return;
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
      const point = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      // Same "don't recenter on our own move" rule as the marker drag —
      // Admin clicked a spot they can already see; jumping the camera to
      // centre it would shift everything under the cursor.
      selfMovedRef.current = point;
      onRelocateRef.current?.(point);
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
