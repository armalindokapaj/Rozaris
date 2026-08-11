"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Box, Home, Palette, Search, Sun, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { DetailModelLayer } from "@/components/map/DetailModelLayer";
import {
  STATUS_COLOR,
  TIME_PRESETS,
  VIEW_PRESETS,
  defaultHourForPreset,
  lightPresetForHour,
  type ViewPreset,
} from "@/lib/viewerPresets";
import { DarkSelect, MenuIconButton, formatHour } from "./ViewerChrome";
import type { ProjectDetailModel, Unit } from "@/lib/types";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

type AvailabilityFilter = "all" | Unit["status"];

const DEFAULT_ZOOM = 18.6;
const DEFAULT_PITCH = 62;
const DEFAULT_BEARING = 0;

/**
 * The live-Mapbox path for the Project 3D Experience — renders admin's
 * detailed GLB (ProjectDetailModel) on a real Mapbox map at the project's
 * real coordinates, exactly like the search page's model just zoomed into
 * one building, with native drag/scroll/touch navigation replacing
 * OrbitControls entirely. Only rendered by ThreeProjectViewer.tsx (the
 * dispatcher) once a project has an enabled detail model — every other
 * project keeps using ProceduralProjectViewer.tsx unchanged.
 */
export const MapboxProjectViewer = forwardRef<
  ThreeProjectViewerHandle,
  ThreeProjectViewerProps & { detailModel: ProjectDetailModel }
>(function MapboxProjectViewer(
  {
    project,
    detailModel,
    className,
    selectedUnitId = null,
    onSelectUnit,
    showChrome = true,
    onBarOpenChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layerRef = useRef<DetailModelLayer | null>(null);

  const [ready, setReady] = useState(false);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [filter, setFilter] = useState<AvailabilityFilter>("all");
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
  const [minArea, setMinArea] = useState<number | null>(null);
  const [panel, setPanel] = useState<"search" | "time" | "viewPreset" | null>(null);
  const [timeOfDay, setTimeOfDay] = useState(() => defaultHourForPreset("daylight"));
  const [viewPreset, setViewPreset] = useState<ViewPreset>("realistic");
  const { t } = useT();

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  function matchesFilters(u: Unit): boolean {
    if (filter !== "all" && u.status !== filter) return false;
    if (bedroomFilter != null && u.bedrooms < bedroomFilter) return false;
    if (bathroomFilter != null && u.bathrooms < bathroomFilter) return false;
    if (minArea != null && u.area < minArea) return false;
    return true;
  }

  // "Unit Search" bottom-bar toggle IS the "visitor opened Unit Search"
  // gate from the PRD — boxes only ever render while this panel is open,
  // on top of DetailModelLayer's own admin-linked-node requirement.
  const showUnitBoxes = panel === "search";

  useEffect(() => {
    onBarOpenChange?.(panel !== null && showChrome);
  }, [panel, showChrome, onBarOpenChange]);

  const areaBounds = useMemo(() => {
    const areas = project.units.map((u) => u.area);
    const min = areas.length ? Math.floor(Math.min(...areas) / 5) * 5 : 0;
    const max = areas.length ? Math.ceil(Math.max(...areas) / 5) * 5 : 200;
    return { min, max: max > min ? max : min + 10 };
  }, [project.units]);

  useImperativeHandle(ref, () => ({
    resetView: () => {
      mapRef.current?.jumpTo({
        center: [project.coords.lng, project.coords.lat],
        zoom: DEFAULT_ZOOM,
        pitch: DEFAULT_PITCH,
        bearing: DEFAULT_BEARING,
      });
    },
    captureScreenshot: () => {
      const map = mapRef.current;
      if (!map) return null;
      return map.getCanvas().toDataURL("image/png");
    },
  }));

  // --- Init once per mount ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !token) {
      if (!token) setFailReason(t("map.mapPreviewTokenHint"));
      return;
    }
    if (!mapboxgl.supported()) {
      setFailReason(t("map.noWebglShort"));
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/armalindokapaj/cms9jpj8b008x01s9g1fib0f7",
      center: [project.coords.lng, project.coords.lat],
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      attributionControl: false,
      // Screenshot button reads this canvas directly (see captureScreenshot
      // above) — without this, the browser is free to clear the drawing
      // buffer right after presenting, same gotcha as the procedural
      // viewer's WebGLRenderer.
      preserveDrawingBuffer: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      const layer = new DetailModelLayer({
        onSelectUnit: (unitId) => {
          const unit = project.units.find((u) => u.id === unitId);
          if (unit) onSelectUnit?.(unit);
        },
        onLoadError: (error) => {
          console.error("Project 3D Experience: failed to load detailed GLB", error);
        },
      });
      map.addLayer(layer);
      layerRef.current = layer;
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, project.id]);

  // --- Placement (glbUrl/scale/rotation/altitude) ---
  useEffect(() => {
    if (!ready) return;
    layerRef.current?.setPlacement({
      glbUrl: detailModel.glbUrl,
      lng: project.coords.lng,
      lat: project.coords.lat,
      scale: detailModel.scale,
      rotationDeg: detailModel.rotationDeg,
      altitudeOffset: detailModel.altitudeOffset,
    });
  }, [
    ready,
    detailModel.glbUrl,
    detailModel.scale,
    detailModel.rotationDeg,
    detailModel.altitudeOffset,
    project.coords.lng,
    project.coords.lat,
  ]);

  // --- Unit links + live unit data ---
  useEffect(() => {
    if (!ready) return;
    layerRef.current?.setLinks(detailModel.unitLinks, project.units);
  }, [ready, detailModel.unitLinks, project.units]);

  useEffect(() => {
    if (!ready) return;
    layerRef.current?.setShowUnitBoxes(showUnitBoxes);
  }, [ready, showUnitBoxes]);

  useEffect(() => {
    if (!ready) return;
    layerRef.current?.setFilter(matchesFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter, bedroomFilter, bathroomFilter, minArea]);

  useEffect(() => {
    if (!ready) return;
    layerRef.current?.setSelectedUnitId(selectedUnitId);
  }, [ready, selectedUnitId]);

  useEffect(() => {
    if (!ready) return;
    layerRef.current?.setMaterialPreset(viewPreset);
  }, [ready, viewPreset]);

  // --- Time of Day -> Mapbox Standard's native basemap light preset,
  // instead of hand-rolled sun-angle math (no fake sun to fake once this
  // is a real Mapbox map with its own lighting). ---
  useEffect(() => {
    if (!ready || !showChrome) return;
    mapRef.current?.setConfigProperty("basemap", "lightPreset", lightPresetForHour(timeOfDay));
  }, [ready, timeOfDay, showChrome]);

  function resetToNorth() {
    mapRef.current?.easeTo({ bearing: 0, duration: 300 });
  }

  if (failReason) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-900 text-center text-white",
          className
        )}
      >
        <Box className="h-8 w-8 text-white/50" strokeWidth={1.5} />
        <p className="text-sm text-white/70">{failReason}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
        </div>
      )}

      {showChrome && ready && (
        <button
          onClick={resetToNorth}
          aria-label={t("project.northSign")}
          className="glass-panel-dark absolute bottom-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full text-white"
        >
          <span className="flex flex-col items-center leading-none">
            <span className="text-[9px] font-bold">N</span>
            <svg viewBox="0 0 24 24" className="mt-0.5 h-3 w-3" fill="currentColor" aria-hidden="true">
              <path d="M12 3 L16 15 L12 12 L8 15 Z" />
            </svg>
          </span>
        </button>
      )}

      {showChrome && ready && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          {panel === null && (
            <div className="glass-panel-dark flex items-center gap-1 rounded-pill p-1.5">
              <MenuIconButton
                icon={Home}
                label={t("project.home")}
                onClick={() =>
                  mapRef.current?.jumpTo({
                    center: [project.coords.lng, project.coords.lat],
                    zoom: DEFAULT_ZOOM,
                    pitch: DEFAULT_PITCH,
                    bearing: DEFAULT_BEARING,
                  })
                }
              />
              <MenuIconButton
                icon={Search}
                label={t("unit.viewerUnitSearch")}
                onClick={() => setPanel("search")}
              />
              <MenuIconButton icon={Sun} label={t("project.timeOfDay")} onClick={() => setPanel("time")} />
              <MenuIconButton
                icon={Palette}
                label={t("project.viewPreset")}
                onClick={() => setPanel("viewPreset")}
              />
            </div>
          )}

          {panel === "search" && (
            <div className="glass-panel-dark relative flex w-full flex-wrap items-end gap-4 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
              <div className="min-w-[9rem] flex-1 sm:flex-none sm:w-36">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                  {t("unit.viewerSurface")}{" "}
                  <span className="text-white/80">
                    {t("unit.viewerSurfaceMin", { area: minArea ?? areaBounds.min })}
                  </span>
                </p>
                <input
                  type="range"
                  min={areaBounds.min}
                  max={areaBounds.max}
                  step={5}
                  value={minArea ?? areaBounds.min}
                  onChange={(e) => setMinArea(Number(e.target.value))}
                  className="h-6 w-full accent-white"
                />
              </div>

              <DarkSelect
                label={t("unit.beds")}
                value={bedroomFilter == null ? "all" : String(bedroomFilter)}
                onChange={(v) => setBedroomFilter(v === "all" ? null : Number(v))}
                options={[
                  ["all", t("unit.viewerFilterAll")],
                  ["1", t("unit.bedPlus", { count: 1 })],
                  ["2", t("unit.bedPlus", { count: 2 })],
                  ["3", t("unit.bedPlus", { count: 3 })],
                  ["4", t("unit.bedPlus", { count: 4 })],
                ]}
              />

              <DarkSelect
                label={t("unit.baths")}
                value={bathroomFilter == null ? "all" : String(bathroomFilter)}
                onChange={(v) => setBathroomFilter(v === "all" ? null : Number(v))}
                options={[
                  ["all", t("unit.viewerFilterAll")],
                  ["1", t("filters.countPlus", { count: 1 })],
                  ["2", t("filters.countPlus", { count: 2 })],
                ]}
              />

              <DarkSelect
                label={t("unit.viewerAvailability")}
                value={filter}
                onChange={(v) => setFilter(v as AvailabilityFilter)}
                options={(["all", "available", "reserved", "sold"] as const).map(
                  (f): [string, string] => [
                    f,
                    t(f === "all" ? "unit.viewerFilterAll" : `unit.status${f[0].toUpperCase()}${f.slice(1)}`),
                  ]
                )}
                dotColor={filter !== "all" ? STATUS_COLOR[filter] : undefined}
              />

              <button
                onClick={() => setPanel(null)}
                aria-label={t("common.close")}
                className="absolute right-2.5 top-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {panel === "time" && (
            <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-6 rounded-panel px-5 py-4 pr-11 sm:w-auto sm:flex-nowrap">
              <div className="flex items-center gap-3">
                <p className="font-serif text-2xl text-white">{formatHour(timeOfDay)}</p>
                <DarkSelect
                  label={t("project.preset")}
                  value=""
                  onChange={(v) => setTimeOfDay(Number(v))}
                  options={[["", t("project.preset")], ...TIME_PRESETS.map(([key, hour]): [string, string] => [String(hour), t(key)])]}
                />
              </div>

              <div className="min-w-[10rem] flex-1">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/50">
                  <span>{t("project.timeOfDay")}</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={22}
                  step={0.5}
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(Number(e.target.value))}
                  className="h-6 w-full accent-white"
                />
              </div>

              <button
                onClick={() => setPanel(null)}
                aria-label={t("common.close")}
                className="absolute right-2.5 top-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {panel === "viewPreset" && (
            <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-2 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
              {VIEW_PRESETS.map(([id, labelKey]) => (
                <button
                  key={id}
                  onClick={() => setViewPreset(id)}
                  aria-pressed={viewPreset === id}
                  className={cn(
                    "rounded-control px-4 py-2.5 text-sm font-semibold transition-colors",
                    viewPreset === id ? "bg-brand-500 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {t(labelKey)}
                </button>
              ))}

              <button
                onClick={() => setPanel(null)}
                aria-label={t("common.close")}
                className="absolute right-2.5 top-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
