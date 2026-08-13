"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Bath, BedDouble, Box, Camera, Home, Layers, Palette, Ruler, Search, Sun, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import {
  TIME_PRESETS,
  UNIT_BOX_COLOR,
  VIEW_PRESETS,
  XRAY_DEFAULT_FACADE_OPACITY,
  type ViewPreset,
} from "@/lib/viewerPresets";
import { RenderEngine, type AvailabilityFilter, type RenderEngineCallbacks, type UnitFilters } from "@/lib/render-engine/RenderEngine";
import { DarkSelect, MenuIconButton, StatusLegend, formatHour } from "./ViewerChrome";
import type { Unit } from "@/lib/types";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

// Same map UnitPreviewCard/UnitDetailPanel/UnitDiscoveryPanel each already
// declare locally rather than sharing one module — matching that existing
// precedent here too.
const STATUS_LABEL_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

/**
 * ROZARIS's one real "3D Experience" engine — a standalone WebGPU/WebGL2
 * canvas the app fully owns ("3D Experience Phase 1"). Renders either:
 *  - the procedural box-massing fallback (lib/threeBuilding.ts) for any
 *    project with no enabled detail model, or
 *  - the admin-uploaded detailed GLB (useProjectDetailModel), with its
 *    linked `Unit_<number>` boxes, once one is enabled —
 * in the SAME owned scene, camera and renderer, so real environment
 * lighting, a real geographic sun (src/lib/sunPosition.ts) and real glass
 * materials apply uniformly regardless of which content is loaded.
 *
 * Rewrite Track B, Phase 1: this component is now a thin wrapper around
 * `RenderEngine` (src/lib/render-engine/RenderEngine.ts) — every actual
 * Three.js object lives on that class instance, not in this component's
 * refs. React's job here is reduced to: own UI-only state (filters, which
 * bottom-panel is open, hover tooltip position), construct one engine
 * instance per component instance, and call its methods from effects —
 * never touch a `THREE.*` object directly. See the engine file's own doc
 * comment for the full architectural rationale.
 */
export const ProceduralProjectViewer = forwardRef<ThreeProjectViewerHandle, ThreeProjectViewerProps>(
  function ProceduralProjectViewer(
    {
      project,
      config,
      detailModel,
      hdriUrl = null,
      className,
      selectedUnitId = null,
      onSelectUnit,
      constructionProgressPercent,
      showChrome = true,
      onBarOpenChange,
      showPerfStats = false,
      onPerfStats,
      viewPreset: viewPresetProp,
      onViewPresetChange,
      xrayEnabled: xrayEnabledProp,
    },
    ref
  ) {
    // Failure recovery: a GLB that fails to load (bad URL/network/corrupt
    // file) flips this, which turns `usingGlb` off and — since it's in
    // the setup effect's own dependency array — makes the effect
    // naturally re-run and fall back to procedural massing. Reset below
    // whenever the URL itself changes, so a freshly-published fix gets a
    // real retry instead of staying stuck in fallback mode.
    const [glbLoadFailed, setGlbLoadFailed] = useState(false);
    useEffect(() => {
      setGlbLoadFailed(false);
    }, [detailModel?.glbUrl]);
    const usingGlb = !!(detailModel?.enabled && detailModel.glbUrl) && !glbLoadFailed;

    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipElRef = useRef<HTMLDivElement>(null);

    const [ready, setReady] = useState(false);
    const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
    const [filter, setFilter] = useState<AvailabilityFilter>("all");
    const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
    const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
    const [minArea, setMinArea] = useState<number | null>(null);
    const [panel, setPanel] = useState<"search" | "time" | "viewPreset" | "xray" | "cameraPresets" | null>(null);
    const [timeOfDay, setTimeOfDay] = useState(() => config.defaultTimeOfDay);
    // Controlled/uncontrolled hybrid (dark-theme configurator restyle) —
    // the Admin editor's new viewport toolbar drives these externally
    // (via viewPresetProp/onViewPresetChange) since showChrome={false}
    // there means the internal bottom-menu switcher that used to be the
    // only way to change this is hidden. Every public-viewer call site
    // passes neither prop, so `internalViewPreset` (this component's
    // original, unchanged behavior) is what's actually used there.
    const [internalViewPreset, setInternalViewPreset] = useState<ViewPreset>("realistic");
    const viewPreset = viewPresetProp ?? internalViewPreset;
    const setViewPreset = onViewPresetChange ?? setInternalViewPreset;
    const [xrayFacadeOpacity, setXrayFacadeOpacity] = useState(XRAY_DEFAULT_FACADE_OPACITY);
    const [hoveredUnit, setHoveredUnit] = useState<Unit | null>(null);
    // Performance inspector (Publish/runtime hardening pass) — admin-only,
    // gated by showPerfStats not showChrome (see viewerTypes.ts).
    const [perfStats, setPerfStats] = useState<{ fps: number; drawCalls: number; triangles: number; dpr: number } | null>(
      null
    );
    // "Unit Search" gates GLB unit-box visibility, same as the old
    // MapboxProjectViewer — procedural units are always visible/filterable.
    const showUnitBoxes = panel === "search";
    // X-Ray is GLB-only — "facade" isn't a meaningful concept for the
    // procedural massing fallback's already-see-through construction
    // shells — and, same "gated by which panel is open" pattern as
    // showUnitBoxes above, is only active while its own panel is open.
    // `xrayEnabledProp` (controlled mode, dark-theme configurator restyle)
    // overrides this derivation entirely when supplied — the Admin
    // editor's viewport toolbar drives it directly since `panel` never
    // becomes "xray" there (the bottom menu that sets it is hidden).
    const xrayEnabled = xrayEnabledProp ?? (usingGlb && panel === "xray");
    const { t } = useT();
    const priceFmt = usePriceFormat();

    const filters: UnitFilters = { status: filter, bedrooms: bedroomFilter, bathrooms: bathroomFilter, minArea };

    // Admin-configurable status colors (full-configurator pass) — falls
    // back to the original hardcoded constants for any config predating
    // these fields, same `?? default` pattern as RenderEngine.ts's
    // resolveUnitColors, which this mirrors so the legend/filter-dot swatch
    // shown here always matches what the 3D scene actually renders.
    // StatusLegend/DarkSelect's `colors`/`dotColor` props are hex numbers
    // (unchanged), so the config's hex *strings* are parsed once here.
    const unitColors = useMemo(() => {
      const toHexNumber = (hex: string | undefined, fallback: number) =>
        hex ? parseInt(hex.replace("#", ""), 16) : fallback;
      return {
        available: toHexNumber(config.unitColorAvailable, UNIT_BOX_COLOR.available),
        reserved: toHexNumber(config.unitColorReserved, UNIT_BOX_COLOR.reserved),
        sold: toHexNumber(config.unitColorSold, UNIT_BOX_COLOR.sold),
      };
    }, [config.unitColorAvailable, config.unitColorReserved, config.unitColorSold]);

    // Presentation-only (which statuses appear in the bottom-left legend) —
    // a small, pure re-derivation, not a Three.js mutation, so it stays
    // here rather than in the engine.
    function matchesFiltersForLegend(u: Unit): boolean {
      if (filter !== "all" && u.status !== filter) return false;
      if (bedroomFilter != null && u.bedrooms < bedroomFilter) return false;
      if (bathroomFilter != null && u.bathrooms < bathroomFilter) return false;
      if (minArea != null && u.area < minArea) return false;
      return true;
    }

    // Status legend — only statuses actually present among currently-
    // filtered units, in a fixed available/reserved/sold order.
    const presentStatuses = useMemo(() => {
      const set = new Set(project.units.filter(matchesFiltersForLegend).map((u) => u.status));
      return (["available", "reserved", "sold"] as const).filter((s) => set.has(s));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.units, filter, bedroomFilter, bathroomFilter, minArea]);

    useEffect(() => {
      onBarOpenChange?.(panel !== null && showChrome);
    }, [panel, showChrome, onBarOpenChange]);

    const areaBounds = useMemo(() => {
      const areas = project.units.map((u) => u.area);
      const min = areas.length ? Math.floor(Math.min(...areas) / 5) * 5 : 0;
      const max = areas.length ? Math.ceil(Math.max(...areas) / 5) * 5 : 200;
      return { min, max: max > min ? max : min + 10 };
    }, [project.units]);

    // --- Engine instance: one per component instance, persists across
    // mount()/dispose() cycles exactly like the old refs did. Callbacks
    // are rebuilt every render (closures over the latest props/state
    // setters) and pushed onto the engine directly in the render body —
    // same "always current without an extra effect" pattern the original
    // used for showPerfStatsRef. ---
    const callbacks: RenderEngineCallbacks = {
      t,
      onReady: setReady,
      onWebglFail: setWebglFailReason,
      onGlbLoadFailed: () => setGlbLoadFailed(true),
      onHoverChange: setHoveredUnit,
      onPointerMove: (clientX, clientY) => {
        if (tooltipElRef.current) {
          tooltipElRef.current.style.transform = `translate(${clientX + 16}px, ${clientY + 16}px)`;
        }
      },
      onSelectUnit,
      onPerfStats: (stats) => {
        setPerfStats(stats);
        // Dark-theme configurator restyle — mirrors the same stats to a
        // caller-supplied prop (EditorShell's right-rail "Performance
        // Overview" card) in addition to this component's own state,
        // which still drives the built-in floating overlay below (now
        // suppressed when a caller opts into rendering its own).
        onPerfStats?.(stats);
      },
    };
    const engineRef = useRef<RenderEngine | null>(null);
    if (!engineRef.current) {
      engineRef.current = new RenderEngine(callbacks, project, config);
    }
    engineRef.current.setCallbacks(callbacks);
    engineRef.current.showPerfStats = showPerfStats;

    function resetCamera() {
      engineRef.current?.resetCamera();
    }
    function resetToNorth() {
      engineRef.current?.resetToNorth();
    }

    useImperativeHandle(ref, () => ({
      resetView: resetCamera,
      captureScreenshot: () => engineRef.current?.captureScreenshot() ?? null,
      getCameraState: () => engineRef.current?.getCameraState() ?? null,
    }));

    // --- One-time scene setup per project/content-mode/rendering-mode —
    // delegates entirely to engine.mount()/dispose(). ---
    useEffect(() => {
      const container = containerRef.current;
      const engine = engineRef.current;
      if (!container || !engine) return;
      engine.mount(container, {
        project,
        config,
        detailModel,
        usingGlb,
        viewPreset,
        xrayEnabled,
        xrayFacadeOpacity,
        selectedUnitId,
        filters,
        constructionProgressPercent,
        showUnitBoxes,
      });
      return () => {
        engine.dispose();
      };
      // Geometry/renderer only depend on which content is loaded — config
      // tweaks that don't require a full rebuild are applied in-place by
      // the effects below instead. shadowsEnabled/ssrEnabled/gtaoEnabled/
      // antialiasEnabled (full-configurator pass) need a full pipeline
      // rebuild same as qualityPreset/renderingMode already did — no new
      // "cheap update" plumbing added, just riding the same remount this
      // effect already does for those two.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      project.id,
      usingGlb,
      detailModel?.glbUrl,
      config.renderingMode,
      config.qualityPreset,
      config.shadowsEnabled,
      config.ssrEnabled,
      config.gtaoEnabled,
      config.antialiasEnabled,
    ]);

    // --- Platform HDRI loading (Task 2 — Track A) ---
    useEffect(() => {
      if (!ready) return;
      engineRef.current?.setHdri(hdriUrl, config);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, hdriUrl]);

    // --- Apply lower-cost config changes without a full rebuild: ground/
    // shell visibility, camera limits, glass tier, view preset. ---
    useEffect(() => {
      if (!ready) return;
      engineRef.current?.applyLiveUpdate({ project, config, detailModel, usingGlb, viewPreset, xrayEnabled, xrayFacadeOpacity });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      ready,
      config.groundEnabled,
      config.constructionStagesEnabled,
      config.cameraMinDistanceMultiplier,
      config.cameraMaxDistanceMultiplier,
      config.cameraMaxPolarDeg,
      config.autoRotate,
      config.glassPreset,
      config.exposure,
      config.cameraFovDesktop,
      config.cameraFovMobile,
      viewPreset,
      xrayEnabled,
      xrayFacadeOpacity,
      detailModel?.scale,
      detailModel?.rotationDeg,
      detailModel?.altitudeOffset,
      detailModel?.unitLinks,
      detailModel?.nodeOverrides,
      detailModel?.sceneManifest,
    ]);

    // --- Real geographic sun + sky/environment — recomputed whenever the
    // effective time-of-day, sky preset, environment intensity or north
    // rotation change. Runs for both the public viewer (live `timeOfDay`
    // state, seeded from config.defaultTimeOfDay) and the Admin preview
    // (showChrome=false locks it to config.defaultTimeOfDay since there's
    // no bottom-bar slider to move it there). ---
    const effectiveTimeOfDay = showChrome ? timeOfDay : config.defaultTimeOfDay;
    useEffect(() => {
      if (!ready) return;
      engineRef.current?.applySunAndEnvironment({ project, config, effectiveTimeOfDay });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      ready,
      effectiveTimeOfDay,
      config.skyPreset,
      config.backgroundPreset,
      config.environmentIntensity,
      config.northRotationDeg,
      config.sunMode,
      config.sunAzimuthDeg,
      config.sunElevationDeg,
      config.sunIntensity,
      project.coords.lat,
      project.coords.lng,
    ]);

    // --- Re-evaluate per-unit appearance whenever selection, filters,
    // construction progress or the Unit-Search panel toggle change ---
    useEffect(() => {
      engineRef.current?.refreshAppearance({
        project,
        config,
        usingGlb,
        selectedUnitId,
        filters,
        viewPreset,
        constructionProgressPercent,
        showUnitBoxes,
        xrayEnabled,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedUnitId,
      filter,
      bedroomFilter,
      bathroomFilter,
      minArea,
      viewPreset,
      constructionProgressPercent,
      config.constructionStagesEnabled,
      showUnitBoxes,
      xrayEnabled,
    ]);

    if (webglFailReason) {
      return (
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-900 text-center text-white",
            className
          )}
        >
          <Box className="h-8 w-8 text-white/50" strokeWidth={1.5} />
          <p className="text-sm text-white/70">{webglFailReason}</p>
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
                {config.viewerUI.home && (
                  <MenuIconButton icon={Home} label={t("project.home")} onClick={resetCamera} />
                )}
                {config.viewerUI.unitSearch && (
                  <MenuIconButton
                    icon={Search}
                    label={t("unit.viewerUnitSearch")}
                    onClick={() => setPanel("search")}
                  />
                )}
                {config.viewerUI.timeOfDay && (
                  <MenuIconButton icon={Sun} label={t("project.timeOfDay")} onClick={() => setPanel("time")} />
                )}
                {config.viewerUI.viewPreset && (
                  <MenuIconButton
                    icon={Palette}
                    label={t("project.viewPreset")}
                    onClick={() => setPanel("viewPreset")}
                  />
                )}
                {usingGlb && (
                  <MenuIconButton icon={Layers} label={t("project.xray")} onClick={() => setPanel("xray")} />
                )}
                {config.cameraPresets.length > 0 && (
                  <MenuIconButton
                    icon={Camera}
                    label={t("project.cameraPresets")}
                    onClick={() => setPanel("cameraPresets")}
                  />
                )}
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
                  dotColor={filter !== "all" ? unitColors[filter] : undefined}
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
                  {config.allowUserTimeChange && (
                    <DarkSelect
                      label={t("project.preset")}
                      value=""
                      onChange={(v) => setTimeOfDay(Number(v))}
                      options={[
                        ["", t("project.preset")],
                        ...TIME_PRESETS.map(([key, hour]): [string, string] => [String(hour), t(key)]),
                      ]}
                    />
                  )}
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
                    disabled={!config.allowUserTimeChange}
                    onChange={(e) => setTimeOfDay(Number(e.target.value))}
                    className="h-6 w-full accent-white disabled:opacity-40"
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

            {panel === "xray" && (
              <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-4 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
                <div className="min-w-[10rem] flex-1">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    <span>{t("project.xrayFacadeOpacity")}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={xrayFacadeOpacity}
                    onChange={(e) => setXrayFacadeOpacity(Number(e.target.value))}
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

            {panel === "cameraPresets" && (
              <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-2 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
                {config.cameraPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      engineRef.current?.jumpToCameraPreset(preset);
                      setPanel(null);
                    }}
                    className="rounded-control px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {preset.label}
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

        {showChrome && ready && (!usingGlb || showUnitBoxes || xrayEnabled) && presentStatuses.length > 0 && (
          <StatusLegend
            className="absolute bottom-4 left-4 z-10"
            statuses={presentStatuses}
            colors={unitColors}
            labels={{
              available: t("unit.statusAvailable"),
              reserved: t("unit.statusReserved"),
              sold: t("unit.statusSold"),
            }}
          />
        )}

        {showChrome && hoveredUnit && (
          <div
            ref={tooltipElRef}
            className="glass-panel-dark pointer-events-none fixed left-0 top-0 z-20 w-52 rounded-panel px-3.5 py-3 text-white"
          >
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/50">
              {t("unit.floorLabel", { n: hoveredUnit.floor })} · {hoveredUnit.code}
            </p>
            <p className="font-numeric mt-0.5 text-base font-semibold">{priceFmt(hoveredUnit.price)}</p>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-white/70">
              <span className="flex items-center gap-1">
                <BedDouble className="h-3.5 w-3.5" /> {hoveredUnit.bedrooms}
              </span>
              <span className="flex items-center gap-1">
                <Bath className="h-3.5 w-3.5" /> {hoveredUnit.bathrooms}
              </span>
              <span className="flex items-center gap-1">
                <Ruler className="h-3.5 w-3.5" /> {hoveredUnit.area} m²
              </span>
            </div>
            <span
              className={cn(
                "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                hoveredUnit.status === "available" && "bg-green-500/20 text-green-300",
                hoveredUnit.status === "reserved" && "bg-amber-500/20 text-amber-300",
                hoveredUnit.status === "sold" && "bg-white/10 text-white/60"
              )}
            >
              {t(STATUS_LABEL_KEY[hoveredUnit.status])}
            </span>
          </div>
        )}

        {/* Suppressed when a caller renders its own copy (see onPerfStats
            prop above) — EditorShell's right-rail Performance Overview
            card, avoiding a duplicate on-canvas overlay. */}
        {showPerfStats && !onPerfStats && perfStats && (
          <div className="glass-panel-dark pointer-events-none absolute left-3 top-3 z-20 space-y-0.5 rounded-control px-3 py-2 font-mono text-[10px] leading-relaxed text-white/80">
            <p>FPS {perfStats.fps}</p>
            <p>
              {t("admin.perfDrawCalls")} {perfStats.drawCalls} · {t("admin.perfTriangles")}{" "}
              {perfStats.triangles.toLocaleString()}
            </p>
            <p>DPR {perfStats.dpr.toFixed(2)}×</p>
            {detailModel && (
              <p className="text-white/50">
                {t("admin.perfPublished")} {detailModel.meshCount ?? "—"}m / {detailModel.materialCount ?? "—"}mat /{" "}
                {detailModel.textureCount ?? "—"}tex / {(detailModel.triangleCount ?? 0).toLocaleString()}tri
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);
