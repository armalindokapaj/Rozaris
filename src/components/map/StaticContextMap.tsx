"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MousePointerClick } from "lucide-react";
import { MapFallback } from "./MapFallback";
import { COLORS } from "./markerFactory";
import { useT } from "@/lib/i18n/useT";
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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const { t } = useT();
  const noTokenReason = !token ? t("map.mapPreviewTokenHint") : null;
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  const [active, setActive] = useState(false);
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
      style: "mapbox://styles/armalindokapaj/cms9jpj8b008x01s9g1fib0f7",
      center: [center.lng, center.lat],
      zoom,
      pitch: 45,
      bearing: -10,
      interactive: true,
      attributionControl: false,
    });
    mapRef.current = map;

    // Embedded inline in the page, so a scroll/drag that merely passes over
    // it shouldn't pan or zoom the map — interaction handlers stay off until
    // the visitor deliberately clicks it (see the overlay below).
    map.scrollZoom.disable();
    map.dragPan.disable();
    map.dragRotate.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();

    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    el.style.background = markerColor;
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 0 0 4px rgba(109,91,246,0.25), 0 4px 10px rgba(0,0,0,0.3)";
    new mapboxgl.Marker({ element: el }).setLngLat([center.lng, center.lat]).addTo(map);
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function activate() {
    const map = mapRef.current;
    if (!map) return;
    map.scrollZoom.enable();
    map.dragPan.enable();
    map.dragRotate.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.keyboard.enable();
    setActive(true);
  }

  if (failReason) {
    return (
      <div className={cn("overflow-hidden rounded-panel", className)}>
        <MapFallback reason={failReason} />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-panel", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!active && (
        <button
          type="button"
          onClick={activate}
          className="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-900/0 text-sm font-medium text-white opacity-0 transition-opacity hover:bg-neutral-900/20 hover:opacity-100"
        >
          <span className="flex items-center gap-1.5 rounded-pill bg-neutral-900/80 px-3.5 py-2 shadow-[var(--shadow-1)]">
            <MousePointerClick className="h-4 w-4" />
            {t("map.clickToInteract")}
          </span>
        </button>
      )}
    </div>
  );
}
