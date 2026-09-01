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

const PICK_HIGHLIGHT_SOURCE = "pick-building-highlight";
const POSITION_MARKER_COLOR = "#6b55f5";                     

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
  coords: GeoPoint;
  modelPosition: GeoPoint;
  glbUrl: string | null;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  hideBaseBuilding: boolean;
  hiddenBuildings: HiddenBuildingEntry[];
  picking?: boolean;
  onToggleBuilding?: (point: GeoPoint, feature: mapboxgl.MapboxGeoJSONFeature) => void;
  canMoveModel?: boolean;
  onMoveModel?: (point: GeoPoint) => void;
  relocating?: boolean;
  onRelocate?: (point: GeoPoint) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const modelLayerRef = useRef<ProjectModelSource | null>(null);
  const buildingHiderRef = useRef<BuildingHider | null>(null);
  const positionMarkerRef = useRef<mapboxgl.Marker | null>(null);
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
  const [failedGlbUrl, setFailedGlbUrl] = useState<string | null>(null);
  const { t } = useT();

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token ? t("map.mapPreviewTokenHint") : null;
  const failReason = noTokenReason ?? webglFailReason;

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
        pickFallbackPx: 0,
      });
      buildingHiderRef.current = new BuildingHider(map);

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

  useEffect(() => {
    const self = selfMovedRef.current;
    if (self && self.lat === coords.lat && self.lng === coords.lng) return;
    mapRef.current?.jumpTo({ center: [coords.lng, coords.lat] });
  }, [coords.lat, coords.lng]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !relocating) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    function onClick(e: mapboxgl.MapMouseEvent) {
      const point = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      selfMovedRef.current = point;
      onRelocateRef.current?.(point);
    }
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [ready, relocating]);

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
