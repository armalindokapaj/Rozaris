"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature, Geometry } from "geojson";
import { Landmark } from "lucide-react";
import { CITY_CENTER } from "@/lib/mockData";
import { useT } from "@/lib/i18n/useT";
import { typeLabelKey, type LocationRow } from "./LocationsTab";

function combineDrawnFeatures(features: Feature[]): Geometry | null {
  const polygons = features.filter(
    (f): f is Feature<import("geojson").Polygon> => f.geometry.type === "Polygon"
  );
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return polygons[0].geometry;
  return { type: "MultiPolygon", coordinates: polygons.map((f) => f.geometry.coordinates) };
}

export function LocationBoundaryEditor({
  locations,
  onSaved,
}: {
  locations: LocationRow[];
  onSaved: () => void;
}) {
  const { t } = useT();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [loadedGeometry, setLoadedGeometry] = useState<Geometry | null>(null);
  const [hasDrawnShape, setHasDrawnShape] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [CITY_CENTER.lng, CITY_CENTER.lat],
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    drawRef.current = draw;
    map.addControl(draw);

    function syncHasShape() {
      setHasDrawnShape(draw.getAll().features.length > 0);
    }
    map.on("draw.create", syncHasShape);
    map.on("draw.delete", syncHasShape);
    map.on("draw.update", syncHasShape);
    map.on("load", () => setReady(true));

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (!selectedId || !ready || !mapRef.current || !drawRef.current) return;
    let cancelled = false;
    setError(null);
    setSaved(false);
    fetch(`/api/admin/locations/${selectedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((row: LocationRow & { boundaryGeometry: Geometry | null }) => {
        if (cancelled) return;
        drawRef.current!.deleteAll();
        setLoadedGeometry(row.boundaryGeometry);
        if (row.boundaryGeometry) {
          drawRef.current!.add({ type: "Feature", properties: {}, geometry: row.boundaryGeometry });
        }
        setHasDrawnShape(row.boundaryGeometry != null);
        const center = row.latitude != null && row.longitude != null ? { lat: row.latitude, lng: row.longitude } : CITY_CENTER;
        mapRef.current!.flyTo({ center: [center.lng, center.lat], zoom: row.boundaryGeometry ? 14 : 13.5 });
      })
      .catch(() => {
        if (!cancelled) setError(t("admin.locations.boundaryLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, ready, t]);

  async function handleSave() {
    if (!drawRef.current || !selectedId) return;
    const geometry = combineDrawnFeatures(drawRef.current.getAll().features);
    if (!geometry) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/locations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundaryGeometry: geometry }),
    });
    if (res.ok) {
      setLoadedGeometry(geometry);
      setSaved(true);
      onSaved();
    } else {
      setError(t("admin.locations.boundarySaveFailed"));
    }
    setSaving(false);
  }

  async function handleClear() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/locations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundaryGeometry: null }),
    });
    if (res.ok) {
      drawRef.current?.deleteAll();
      setLoadedGeometry(null);
      setHasDrawnShape(false);
      onSaved();
    } else {
      setError(t("admin.locations.boundarySaveFailed"));
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3 rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-brand-500" />
        <h2 className="text-sm font-bold text-neutral-900">{t("admin.locations.boundarySectionTitle")}</h2>
      </div>
      <p className="-mt-1 text-xs text-neutral-500">{t("admin.locations.boundarySubtitle")}</p>

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">{t("admin.locations.locationLabel")}</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-w-[220px] rounded-control border border-neutral-200 px-2.5 py-1.5 text-sm"
          >
            <option value="">{t("admin.locations.assignPickerPlaceholder")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {t(typeLabelKey(l.type))} · {l.officialName}
                {l.hasBoundary ? ` (${t("admin.locations.boundaryHasOne")})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedId || saving || !hasDrawnShape}
          onClick={handleSave}
          className="rounded-control bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          {t("admin.locations.saveBoundaryAction")}
        </button>
        <button
          type="button"
          disabled={!selectedId || saving || (!hasDrawnShape && !loadedGeometry)}
          onClick={handleClear}
          className="rounded-control border border-neutral-200 px-3.5 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          {t("admin.locations.clearBoundaryAction")}
        </button>
        {saved && <span className="text-xs font-medium text-success">{t("admin.locations.boundarySaved")}</span>}
        {error && <span className="text-xs font-medium text-danger">{error}</span>}
      </div>

      {!token ? (
        <p className="rounded-card border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-400">
          {t("admin.locations.boundaryNoToken")}
        </p>
      ) : (
        <>
          <div className="relative h-[420px] w-full overflow-hidden rounded-card border border-neutral-200">
            <div ref={containerRef} className="h-full w-full" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-50 text-xs text-neutral-400">
                {t("common.loading")}
              </div>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            {selectedId ? t("admin.locations.boundaryDrawHint") : t("admin.locations.boundaryPickFirst")}
          </p>
        </>
      )}
    </div>
  );
}
