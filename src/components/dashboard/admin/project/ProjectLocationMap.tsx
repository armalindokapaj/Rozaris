"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useT } from "@/lib/i18n/useT";
import type { GeoPoint } from "@/lib/types";

export function ProjectLocationMap({
  value,
  onChange,
  className,
}: {
  value: GeoPoint;
  onChange: (point: GeoPoint) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const lastEmitted = useRef<GeoPoint | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const { t } = useT();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;
    if (!mapboxgl.supported()) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [value.lng, value.lat],
      zoom: 16,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    function emit(point: GeoPoint) {
      lastEmitted.current = point;
      onChangeRef.current(point);
    }

    const marker = new mapboxgl.Marker({ color: "#6b55f5", draggable: true })
      .setLngLat([value.lng, value.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      emit({ lat: p.lat, lng: p.lng });
    });
    markerRef.current = marker;

    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      emit({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on("load", () => setReady(true));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const ours = lastEmitted.current;
    if (ours && ours.lat === value.lat && ours.lng === value.lng) return;
    marker.setLngLat([value.lng, value.lat]);
    map.easeTo({ center: [value.lng, value.lat], duration: 400 });
  }, [value.lat, value.lng]);

  if (!token) {
    return (
      <p className="rounded-card border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">
        {t("locationPicker.noToken")}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="relative h-72 w-full overflow-hidden rounded-card border border-neutral-200">
        <div ref={containerRef} className="h-full w-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 text-xs text-neutral-400">
            {t("common.loading")}
          </div>
        )}
      </div>
    </div>
  );
}
