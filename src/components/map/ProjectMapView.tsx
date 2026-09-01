"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import mapboxgl from "mapbox-gl";
import { ProjectModelLayer } from "@/components/map/ProjectModelLayer";
import { MapFallback } from "@/components/map/MapFallback";
import { sunDirectionVector, sunColorForElevation } from "@/lib/sunPosition";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { GeoPoint } from "@/lib/types";

const POSITION_MARKER_COLOR = "#6b55f5";                     

export interface ProjectMapViewPlacement {
  latitude: number | null;
  longitude: number | null;
  altitude: number;
  headingDeg: number;
  scale: number;
}

export interface ProjectMapViewCamera {
  zoom: number;
  pitchDeg: number;
  bearingDeg: number;
}

const DEFAULT_CAMERA: ProjectMapViewCamera = { zoom: 17.5, pitchDeg: 60, bearingDeg: -20 };

export interface ProjectMapViewSun {
  azimuthDeg: number;
  elevationDeg: number;
  autoIntensityEnabled: boolean;
  autoColorEnabled: boolean;
  manualIntensity: number;
  manualColorHex: string;
  enabled: boolean;
}

export function ProjectMapView({
  project,
  glbUrl,
  placement,
  camera,
  sun,
  editable = false,
  onMove,
  onCaptureCamera,
  className,
}: {
  project: { id: string; coords: GeoPoint };
  glbUrl: string | null;
  placement: ProjectMapViewPlacement;
  camera?: ProjectMapViewCamera;
  sun: ProjectMapViewSun;
  editable?: boolean;
  onMove?: (point: GeoPoint) => void;
  onCaptureCamera?: (camera: ProjectMapViewCamera) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const modelLayerRef = useRef<ProjectModelLayer | null>(null);
  const positionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const [ready, setReady] = useState(false);
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  const [failedGlbUrl, setFailedGlbUrl] = useState<string | null>(null);
  const { t } = useT();

  const resolvedCamera = camera ?? DEFAULT_CAMERA;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const noTokenReason = !token ? t("map.mapPreviewTokenHint") : null;
  const failReason = noTokenReason ?? webglFailReason;

  const lat = placement.latitude ?? project.coords.lat;
  const lng = placement.longitude ?? project.coords.lng;

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
      center: [lng, lat],
      zoom: resolvedCamera.zoom,
      pitch: resolvedCamera.pitchDeg,
      bearing: resolvedCamera.bearingDeg,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      const modelLayer = new ProjectModelLayer({
        onPick: () => {},
        onLoadError: (_projectId, error, url) => {
          console.error("Project Map View: failed to load GLB", error);
          setFailedGlbUrl(url);
        },
      });
      map.addLayer(modelLayer);
      modelLayerRef.current = modelLayer;

      if (editable) {
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
          onMoveRef.current?.({ lng: lngLat.lng, lat: lngLat.lat });
        });
        positionMarkerRef.current = marker;
      }

      setReady(true);
    });

    return () => {
      positionMarkerRef.current?.remove();
      positionMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      modelLayerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only on token/editable change; lat/lng handled by the recenter effect below
  }, [token, editable]);

  useEffect(() => {
    mapRef.current?.jumpTo({ center: [lng, lat] });
  }, [lat, lng]);

  useEffect(() => {
    mapRef.current?.jumpTo({
      zoom: resolvedCamera.zoom,
      pitch: resolvedCamera.pitchDeg,
      bearing: resolvedCamera.bearingDeg,
    });
  }, [resolvedCamera.zoom, resolvedCamera.pitchDeg, resolvedCamera.bearingDeg]);

  useEffect(() => {
    if (!ready) return;
    modelLayerRef.current?.setEntries(
      glbUrl
        ? [
            {
              projectId: project.id,
              glbUrl,
              lng,
              lat,
              scale: placement.scale,
              rotationDeg: placement.headingDeg,
              altitudeOffset: placement.altitude,
            },
          ]
        : []
    );
  }, [ready, project.id, glbUrl, lng, lat, placement.scale, placement.headingDeg, placement.altitude]);

  useEffect(() => {
    if (!ready) return;
    const isNight = sun.elevationDeg <= 0;
    const direction = sunDirectionVector({ elevationDeg: sun.elevationDeg, azimuthDeg: sun.azimuthDeg });
    const color = sun.autoColorEnabled
      ? sunColorForElevation(sun.elevationDeg)
      : new THREE.Color(sun.manualColorHex).getHex();
    const intensity = sun.autoIntensityEnabled
      ? isNight
        ? 0.1
        : 1.2 + Math.max(0, sun.elevationDeg / 90) * 1.8
      : sun.manualIntensity;
    modelLayerRef.current?.setSun({
      direction,
      color,
      intensity,
      ambientIntensity: isNight ? 0.08 : 0.15,
      enabled: sun.enabled,
    });
  }, [
    ready,
    sun.azimuthDeg,
    sun.elevationDeg,
    sun.autoIntensityEnabled,
    sun.autoColorEnabled,
    sun.manualIntensity,
    sun.manualColorHex,
    sun.enabled,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = positionMarkerRef.current;
    if (!ready || !editable || !map || !marker) return;
    marker.setLngLat([lng, lat]);
    marker.addTo(map);
  }, [ready, editable, lat, lng]);

  const loadError = glbUrl != null && failedGlbUrl === glbUrl;

  function handleCaptureCamera() {
    const map = mapRef.current;
    if (!map || !onCaptureCamera) return;
    onCaptureCamera({ zoom: map.getZoom(), pitchDeg: map.getPitch(), bearingDeg: map.getBearing() });
  }

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
      {loadError && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="glass-panel-dark rounded-pill px-3.5 py-2 text-xs font-medium text-white">
            {t("admin.mapModelLoadError")}
          </span>
        </div>
      )}
      {                                                                  
                                                      }
      {editable && onCaptureCamera && ready && (
        <button
          type="button"
          onClick={handleCaptureCamera}
          className="glass-panel-dark absolute bottom-3 left-3 rounded-pill px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black/60"
        >
          Use current view
        </button>
      )}
    </div>
  );
}
