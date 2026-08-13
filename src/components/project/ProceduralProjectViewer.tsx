"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Bath, BedDouble, Box, Camera, Home, Ruler, Scissors, Search, Sun, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { TIME_PRESETS, UNIT_BOX_COLOR } from "@/lib/viewerPresets";
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

/** Multiple Detail-Model Slots pass — the admin perf overlay's per-model
 * counts (mesh/material/texture) now sum across every loaded slot; "—"
 * only when every one of them is null (predates server-side validation
 * recording it), not just the first slot checked. */
function sumOrDash(values: (number | null)[]): string {
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0) return "—";
  return known.reduce((a, b) => a + b, 0).toLocaleString();
}

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
      detailModels,
      hdriUrl = null,
      className,
      selectedUnitId = null,
      onSelectUnit,
      constructionProgressPercent,
      showChrome = true,
      onBarOpenChange,
      showPerfStats = false,
      onPerfStats,
      onSectionDraftChange,
      onSectionDraftCommit,
    },
    ref
  ) {
    // Failure recovery: RenderEngine.ts's mount() only reports total
    // failure (this callback) once EVERY enabled slot's GLB fails to
    // load — a single slot failing just gets skipped there, the others
    // keep rendering (the whole point of independent slots — see
    // "rozaris-3d-multiple-detail-model-slots" memory). This flag is
    // that all-slots-failed fallback to full procedural massing. Reset
    // below whenever the set of slot URLs changes, so a freshly-
    // published fix gets a real retry instead of staying stuck.
    const [glbLoadFailed, setGlbLoadFailed] = useState(false);
    const detailModelUrlsKey = detailModels.map((d) => d.model.glbUrl).join("|");
    useEffect(() => {
      setGlbLoadFailed(false);
    }, [detailModelUrlsKey]);
    // Units read-migration (Configurator scope): computeProjectLayout()
    // inside engine.mount() only depends on which unit ids exist plus
    // each one's buildingName/floor/status (geometry/position/color —
    // see threeBuilding.ts), never bedrooms/bathrooms/area/price/etc.,
    // so this key deliberately only tracks those 4 fields. Same pattern
    // as detailModelUrlsKey above: gives the full-mount effect below a
    // meaningful primitive to re-key on instead of an array reference,
    // since `project.units` now arrives from useProjectUnits (a fresh
    // array on every fetch) rather than a stable mockData/Zustand
    // literal — without this, the editor's live preview would silently
    // keep rendering whatever `project.units` looked like on first
    // mount, never rebuilding once the live Postgres fetch resolves.
    const unitsKey = project.units
      .map((u) => `${u.id}:${u.buildingName}:${u.floor}:${u.status}`)
      .join("|");
    const usingGlb = detailModels.some((d) => d.model.enabled && d.model.glbUrl) && !glbLoadFailed;

    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipElRef = useRef<HTMLDivElement>(null);

    const [ready, setReady] = useState(false);
    const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
    const [filter, setFilter] = useState<AvailabilityFilter>("all");
    const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
    const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
    const [minArea, setMinArea] = useState<number | null>(null);
    const [panel, setPanel] = useState<"search" | "time" | "cameraPresets" | "sections" | null>(null);
    // Sections module — which section a visitor has activated (real clip
    // + cap via RenderEngine.activateSection), if any. Runtime-only UI
    // state, not persisted (mirrors `panel`'s own "not part of config"
    // nature).
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    const [timeOfDay, setTimeOfDay] = useState(() => config.defaultTimeOfDay);
    const [hoveredUnit, setHoveredUnit] = useState<Unit | null>(null);
    // Performance inspector (Publish/runtime hardening pass) — admin-only,
    // gated by showPerfStats not showChrome (see viewerTypes.ts).
    const [perfStats, setPerfStats] = useState<{ fps: number; drawCalls: number; triangles: number; dpr: number } | null>(
      null
    );
    // "Unit Search" gates GLB unit-box visibility, same as the old
    // MapboxProjectViewer — procedural units are always visible/filterable.
    const showUnitBoxes = panel === "search";
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

    // Sections module — real, non-hidden sections a visitor can activate.
    const visibleSections = useMemo(() => config.sections.filter((s) => !s.hidden), [config.sections]);

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
      onSectionDraftChange,
      onSectionDraftCommit,
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
      beginDrawSection: (opts, onComplete) => engineRef.current?.beginDrawSection(opts, onComplete),
      cancelDrawSection: () => engineRef.current?.cancelDrawSection(),
      attachSectionGizmo: (section, mode) => engineRef.current?.attachSectionGizmo(section, mode),
      setSectionGizmoMode: (mode) => engineRef.current?.setSectionGizmoMode(mode),
      detachSectionGizmo: () => engineRef.current?.detachSectionGizmo(),
      getLiveSectionDraft: () => engineRef.current?.getLiveSectionDraft() ?? null,
      activateSection: (sectionId) => engineRef.current?.activateSection(sectionId),
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
        detailModels,
        usingGlb,
        selectedUnitId,
        filters,
        constructionProgressPercent,
        showUnitBoxes,
        // Sections module — `showChrome={false}` is already this
        // codebase's existing signal for "this is the admin editor's own
        // live preview" (see the prop's own doc comment); reused here
        // instead of adding a second, parallel "am I the editor" prop.
        isEditorPreview: !showChrome,
      });
      return () => {
        engine.dispose();
      };
      // Geometry/renderer only depend on which content is loaded — config
      // tweaks that don't require a full rebuild are applied in-place by
      // the effects below instead. shadowsEnabled/antialiasEnabled
      // (full-configurator pass) need a full pipeline rebuild same as
      // qualityPreset/renderingMode already did — no new "cheap update"
      // plumbing added, just riding the same remount this effect already
      // does for those two. ssrEnabled/gtaoEnabled removed entirely
      // (2026-08-13) — see viewerPresets.ts's QUALITY_TIERS header
      // comment.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      project.id,
      unitsKey,
      usingGlb,
      detailModelUrlsKey,
      config.renderingMode,
      config.qualityPreset,
      config.shadowsEnabled,
      config.antialiasEnabled,
      // stencil: true on the renderer only takes effect at construction —
      // same "needs a full remount" reasoning as the flags above.
      config.sectionCapStencilEnabled,
      // Sky/Water/Bloom/Clouds pass — both structurally add/remove a real
      // object or pipeline node rather than just tweaking a number on an
      // already-existing one, same "needs a full remount" reasoning as
      // the flags above (their own strength/radius/distortionScale/size
      // sliders are cheap live updates instead, see the effect below).
      config.waterEnabled,
      config.bloomEnabled,
      // Ground Platform — "disc" vs "infinite" is a real geometry swap
      // (CircleGeometry vs a big PlaneGeometry), same "needs a full
      // remount" reasoning as the two flags above; groundEnabled/
      // groundColor/groundFog* stay cheap live updates below instead.
      config.groundStyle,
    ]);

    // --- Platform HDRI loading (Task 2 — Track A) ---
    useEffect(() => {
      if (!ready) return;
      engineRef.current?.setHdri(hdriUrl, config);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, hdriUrl]);

    // --- Apply lower-cost config changes without a full rebuild: ground/
    // shell visibility, camera limits, glass tier. ---
    useEffect(() => {
      if (!ready) return;
      engineRef.current?.applyLiveUpdate({ project, config, detailModels, usingGlb });
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
      // Whole array, same "depend on the caller's own object/array
      // reference" reasoning the single-model version already relied on
      // (Project3DConfigEditor.tsx/ArchVizClient.tsx rebuild this array
      // fresh whenever any slot's placement/links/overrides change).
      detailModels,
      // Sections module — keeps `RenderEngine.this.config.sections` from
      // going stale for the *public* runtime's `activateSection(id)` path
      // (a visitor picking a floor). The admin editor's own live-editing
      // path (attachSectionGizmo) no longer depends on this at all — it
      // applies the section it's given directly — but this still matters
      // so a newly-added/edited section is selectable without an
      // unrelated field also changing first. Same reference-equality
      // reasoning as `detailModels` above (a fresh array every edit).
      config.sections,
      // Sky/Water/Bloom/Clouds pass — real UniformNode<float>s on the
      // already-constructed waterMesh/bloomNode, no remount needed.
      config.waterDistortionScale,
      config.waterSize,
      config.bloomStrength,
      config.bloomRadius,
      // Ground Platform's ground fog — real live UniformNodes, no remount.
      config.groundColor,
      config.groundFogEnabled,
      config.groundFogRadius,
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
      // Sky/Water/Bloom/Clouds pass — clouds are 3 more uniforms on the
      // same physical sky dome this effect already updates on every tick
      // (see RenderEngine.ts's applySunAndEnvironment).
      config.cloudsEnabled,
      config.cloudCoverage,
      config.cloudDensity,
      config.cloudElevation,
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
        constructionProgressPercent,
        showUnitBoxes,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedUnitId,
      filter,
      bedroomFilter,
      bathroomFilter,
      minArea,
      constructionProgressPercent,
      config.constructionStagesEnabled,
      showUnitBoxes,
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
                {config.cameraPresets.length > 0 && (
                  <MenuIconButton
                    icon={Camera}
                    label={t("project.cameraPresets")}
                    onClick={() => setPanel("cameraPresets")}
                  />
                )}
                {/* Sections module — same "gated on real availability" pattern
                    as Camera Presets above (config.cameraPresets.length > 0):
                    hidden unless the admin actually saved a non-hidden
                    section AND didn't turn the public entry point off. */}
                {(config.viewerUI.sectionsEnabled ?? true) && visibleSections.length > 0 && (
                  <MenuIconButton
                    icon={Scissors}
                    label={t("project.sections")}
                    onClick={() => setPanel("sections")}
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

            {panel === "sections" && (
              <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-2 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
                {visibleSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      const nextActive = activeSectionId === section.id ? null : section.id;
                      setActiveSectionId(nextActive);
                      engineRef.current?.activateSection(nextActive);
                      if (nextActive && section.cameraPreset) {
                        engineRef.current?.jumpToCameraPreset({
                          id: "section-camera",
                          label: section.name,
                          durationMs: 900,
                          ...section.cameraPreset,
                        });
                      }
                      setPanel(null);
                    }}
                    aria-pressed={activeSectionId === section.id}
                    className={cn(
                      "rounded-control px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/10 hover:text-white",
                      activeSectionId === section.id ? "bg-white/10 text-white" : "text-white/70"
                    )}
                  >
                    {section.name}
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

        {/* Sections module — persistent "exit" affordance while a section
            is active, so a visitor doesn't have to remember re-clicking
            the same Sections menu entry toggles it off. */}
        {showChrome && ready && activeSectionId && (
          <button
            onClick={() => {
              setActiveSectionId(null);
              engineRef.current?.activateSection(null);
            }}
            className="glass-panel-dark absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-pill px-3.5 py-2 text-xs font-semibold text-white"
          >
            <Scissors className="h-3.5 w-3.5" />
            {visibleSections.find((s) => s.id === activeSectionId)?.name}
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {showChrome && ready && (!usingGlb || showUnitBoxes) && presentStatuses.length > 0 && (
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
            {detailModels.length > 0 && (
              <p className="text-white/50">
                {/* Multiple Detail-Model Slots pass — real sums across
                    every loaded slot, not just one; "—" only if EVERY
                    slot is missing that count (predates server-side
                    validation recording it). */}
                {t("admin.perfPublished")}{" "}
                {sumOrDash(detailModels.map((d) => d.model.meshCount))}m /{" "}
                {sumOrDash(detailModels.map((d) => d.model.materialCount))}mat /{" "}
                {sumOrDash(detailModels.map((d) => d.model.textureCount))}tex /{" "}
                {detailModels.reduce((sum, d) => sum + (d.model.triangleCount ?? 0), 0).toLocaleString()}tri
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);
