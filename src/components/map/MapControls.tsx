"use client";

import { useEffect, useState } from "react";
import { Plus, Minus, LocateFixed, Box } from "lucide-react";
import type mapboxgl from "mapbox-gl";
import { cn } from "@/lib/utils";

export function MapControls({
  map,
  className,
}: {
  map: mapboxgl.Map | null;
  className?: string;
}) {
  function withMap(fn: (m: mapboxgl.Map) => void) {
    if (map) fn(map);
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2",
        className
      )}
    >
      <button
        aria-label="Reset north / compass"
        onClick={() =>
          withMap((m) => m.easeTo({ bearing: 0, duration: 400 }))
        }
        className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 shadow-md hover:text-brand-600"
      >
        <CompassGlyph map={map} />
      </button>
      <button
        aria-label="Toggle 3D perspective"
        onClick={() =>
          withMap((m) => {
            const pitch = m.getPitch();
            m.easeTo({ pitch: pitch > 10 ? 0 : 55, duration: 500 });
          })
        }
        className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 shadow-md hover:text-brand-600"
      >
        <Box className="h-4.5 w-4.5" />
      </button>
      <div className="glass-panel flex flex-col overflow-hidden rounded-full shadow-md">
        <button
          aria-label="Zoom in"
          onClick={() => withMap((m) => m.zoomIn({ duration: 300 }))}
          className="flex h-11 w-11 items-center justify-center text-neutral-700 hover:text-brand-600"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>
        <div className="h-px bg-neutral-200" />
        <button
          aria-label="Zoom out"
          onClick={() => withMap((m) => m.zoomOut({ duration: 300 }))}
          className="flex h-11 w-11 items-center justify-center text-neutral-700 hover:text-brand-600"
        >
          <Minus className="h-4.5 w-4.5" />
        </button>
      </div>
      <button
        aria-label="Use my location"
        onClick={() => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition((pos) => {
            withMap((m) =>
              m.flyTo({
                center: [pos.coords.longitude, pos.coords.latitude],
                zoom: 14,
                duration: 800,
              })
            );
          });
        }}
        className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 shadow-md hover:text-brand-600"
      >
        <LocateFixed className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}

function CompassGlyph({ map }: { map: mapboxgl.Map | null }) {
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    if (!map) return;
    const update = () => setBearing(map.getBearing());
    update();
    map.on("rotate", update);
    return () => {
      map.off("rotate", update);
    };
  }, [map]);

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: `rotate(${-bearing}deg)` }}
    >
      <path d="M12 2 L15 12 L12 22 L9 12 Z" fill="#6d5bf6" />
      <path d="M12 2 L9 12 L12 8.5 L15 12 Z" fill="#c9c1ff" />
    </svg>
  );
}
