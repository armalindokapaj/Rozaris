"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MapPin } from "lucide-react";
import { CITY_CENTER } from "@/lib/mockData";
import { useT } from "@/lib/i18n/useT";

export function LocationPicker({
  value,
  onChange,
  className,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (point: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const { t } = useT();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const start = value ?? CITY_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [start.lng, start.lat],
      zoom: value ? 15.5 : 12.4,
      attributionControl: false,
    });
    mapRef.current = map;

    function placeMarker(lng: number, lat: number) {
      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ color: "#6b55f5", draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current!.getLngLat();
          onChangeRef.current({ lat: p.lat, lng: p.lng });
        });
      } else {
        markerRef.current.setLngLat([lng, lat]);
      }
    }

    if (value) placeMarker(value.lng, value.lat);

    map.on("click", (e) => {
      placeMarker(e.lngLat.lng, e.lngLat.lat);
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on("load", () => setReady(true));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <div className={className}>
        <p className="rounded-card border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">
          {t("locationPicker.noToken")}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative h-56 w-full overflow-hidden rounded-card border border-neutral-200">
        <div ref={containerRef} className="h-full w-full" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 text-xs text-neutral-400">
            {t("common.loading")}
          </div>
        )}
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {value ? t("locationPicker.confirmed") : t("locationPicker.prompt")}
      </p>
    </div>
  );
}
