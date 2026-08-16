"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { useProject3DConfig } from "@/hooks/useProject3DConfig";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer, type ThreeProjectViewerHandle } from "@/components/project/ThreeProjectViewer";
import { ViewerHUD } from "@/components/project/viewer-hud/ViewerHUD";
import { getViewerLayoutState } from "@/components/project/viewer-hud/layoutState";
import type { ActiveModule } from "@/components/project/viewer-hud/types";
import { UnitsWorkspace } from "@/components/project/units-workspace/UnitsWorkspace";
import { computeSunTimeline, geographicSunPosition, sunPositionForAnchors, sunTimelinePresets, type SunTimePreset } from "@/lib/sunPosition";
import type { CameraPreset } from "@/lib/types";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitDetailPanel } from "@/components/project/UnitDetailPanel";
import { UnitPreviewCard } from "@/components/project/UnitPreviewCard";
import type { Project, Unit } from "@/lib/types";

/**
 * Front Page / Idle Experience rebuild (2026-08-16): the header/bottom-nav
 * chrome now comes from `<ViewerHUD>` (compass, project identity, utility
 * capsule, 4-icon nav, module placeholder) per its own PRD — see that
 * component's doc comment. `unitPanelOpen`/`selectedUnit`/`fullDetailOpen`
 * below predate this rebuild and are currently dead state: nothing sets
 * `unitPanelOpen` or `selectedUnit` to a truthy value anywhere in this
 * file, so `UnitDiscoveryPanel`/`UnitPreviewCard`/`UnitDetailPanel` can
 * never actually open yet. Left as-is rather than removed — the Units
 * Search Mode PRD replaces this whole flow with a real `UnitsWorkspace`
 * next, at which point this dead state goes away for real.
 *
 * Interaction tab (PRD §39) — `viewerConfig.viewerUI` is real again:
 * Fullscreen/Screenshot/Information Card are genuinely wired (hidden
 * when off); every other Interaction toggle isn't read here yet since
 * the systems they'd gate (3D hover/select/highlight/isolation, a public
 * Filters UI, a public Shots menu) don't exist in this rebuilt viewer —
 * see InteractionPanel.tsx's own doc comment.
 *
 * Real bug fixed alongside the Environment tab (PRD §7-13) build: this
 * component already fetched the real `viewerConfig` (useProject3DConfig)
 * for `viewerUI` gating, but never forwarded `cameraConfig`/
 * `qualityConfig`/`environmentConfig` to `<ThreeProjectViewer>` — so every
 * public visitor saw RenderEngine's hardcoded defaults instead of
 * whatever an admin actually saved on the Camera/Performance/Environment
 * tabs. Same class of gap as the Phase-1 Publish-pipeline bug (admin
 * editor's own live preview never round-trips through the public path
 * that would have caught it).
 */
export function ArchVizClient({ project }: { project: Project }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeProjectViewerHandle>(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  // The 3D click flow always lands on the small UnitPreviewCard first;
  // this only flips true when that card's own "View Unit" button asks for
  // the full gallery/publisher-contact panel.
  const [fullDetailOpen, setFullDetailOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  // Units Search Mode PRD §20/§26 "global layout state" — lifted up here
  // (rather than living inside ViewerHUD) because UnitsWorkspace is a
  // sibling of ViewerHUD (PRD §36's own component tree), not a child of
  // it, and both need to react to the same active menu.
  const [activeModule, setActiveModule] = useState<ActiveModule>("explore");
  const isDesktop = useIsDesktop();
  const { leftPanelOpen } = getViewerLayoutState(activeModule, isDesktop);
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const construction = useProjectConstruction(project);
  const detailModels = useProjectDetailModel(project.id);
  const viewerConfig = useProject3DConfig(project.id);
  // Units Search Mode PRD, Phase 3 (2026-08-16) — real Postgres units
  // (same source the admin Configurator's own Units panel reads),
  // replacing Phase 2's placeholder inventory (since removed). `?? []`
  // while the initial GET is in flight or this project genuinely has
  // none yet — an honestly empty list, not a fabricated one.
  const { units: liveUnits } = useProjectUnits(project.id);
  const units = useMemo(() => liveUnits ?? [], [liveUnits]);
  // Same `units` handed to every slot — `applyUnitBoxes` only actually
  // matches entries against that slot's own `unitLinks` map, so a unit
  // with no link for a given slot's meshes is simply never touched;
  // passing the whole project's inventory to every slot is correct, not
  // just convenient (a project's real units may span multiple slots).
  const detailModelEntries = useMemo(
    () => detailModels.map((entry) => ({ ...entry, units, statusPreviewEnabled: true })),
    [detailModels, units]
  );

  // More / Settings Menu PRD — real project fields for MoreMenu's own
  // Project Information section (and the header identity plate, which
  // this replaces the old projectName/developerName/city trio for).
  const moreMenuProject = useMemo(
    () => ({
      slug: project.slug,
      name: project.name,
      developerName: project.developer.name,
      developerVerified: project.developer.verified,
      city: project.city,
      propertyType: project.propertyType,
      completionLabel: project.completionLabel,
    }),
    [project]
  );
  const { t } = useT();

  // Sun & Time PRD §29 "Persistence" / §40 "State Architecture" — lives
  // here (not inside ViewerHUD/SunTimeWorkspace) for the same reason
  // `activeModule` does: it must survive switching to Units/Views/Explore
  // and back, and it directly feeds `environmentConfig` below, which only
  // this component computes. `null` means "untouched — follow the
  // project's published default" rather than duplicating that default
  // into local state the moment the config loads; Reset is then just
  // "go back to null", not "remember what the default was".
  const [liveSunTimeHours, setLiveSunTimeHours] = useState<number | null>(null);
  const [liveSunDate, setLiveSunDate] = useState<string | null>(null);
  const [activeSunPreset, setActiveSunPreset] = useState<SunTimePreset["id"] | null>(null);
  const effectiveSunTimeHours = liveSunTimeHours ?? viewerConfig.viewerTimeHours;
  const effectiveSunDate = liveSunDate ?? viewerConfig.simulationDate;
  // §9's own gate: an admin has to opt a project into BOTH a time-driven
  // sun ("solarControllerEnabled") AND public scrubbing of it
  // ("viewerTimeControlEnabled", real DB field, previously unread by any
  // public code path — see SunSkySubtab.tsx's own toggle) before a
  // visitor can actually drag this. Every project defaults to both off
  // today, so the common case renders the real panel read-only rather
  // than hiding it — see this session's own scoping decision.
  const sunTimeInteractive = viewerConfig.solarControllerEnabled && viewerConfig.viewerTimeControlEnabled;

  // §10/§21-22 — real sunrise/sunset/solar-noon + the presets derived from
  // them, computed identically whether the admin picked "geographic" (real
  // lat/lng astronomy) or "manual" (an authored anchor curve) — see
  // sunPosition.ts's own doc comment for why one function covers both.
  const sunTimeline = useMemo(() => {
    const elevationAt =
      viewerConfig.solarPathMode === "geographic"
        ? (h: number) => geographicSunPosition(new Date(effectiveSunDate), viewerConfig.geoLatitude, viewerConfig.geoLongitude, h).elevationDeg
        : (h: number) => sunPositionForAnchors(h, viewerConfig.solarAnchors).elevationDeg;
    return computeSunTimeline(elevationAt);
  }, [viewerConfig.solarPathMode, viewerConfig.geoLatitude, viewerConfig.geoLongitude, viewerConfig.solarAnchors, effectiveSunDate]);
  const sunTimePresets = useMemo(() => sunTimelinePresets(sunTimeline), [sunTimeline]);
  const sunTimeBounds = useMemo(
    () => ({
      startHours: viewerConfig.viewerTimeStartHours,
      endHours: viewerConfig.viewerTimeEndHours,
      stepMinutes: viewerConfig.viewerTimeStepMinutes,
    }),
    [viewerConfig.viewerTimeStartHours, viewerConfig.viewerTimeEndHours, viewerConfig.viewerTimeStepMinutes]
  );

  const handleSunTimeChange = useCallback((hours: number) => {
    setLiveSunTimeHours(hours);
    setActiveSunPreset(null);
  }, []);
  const handleSunDateChange = useCallback((iso: string) => {
    setLiveSunDate(iso);
    setActiveSunPreset(null);
  }, []);
  const handleSunPresetSelect = useCallback((preset: SunTimePreset) => {
    setLiveSunTimeHours(preset.hour);
    setActiveSunPreset(preset.id);
  }, []);
  const handleSunTimeReset = useCallback(() => {
    setLiveSunTimeHours(null);
    setLiveSunDate(null);
    setActiveSunPreset(null);
  }, []);

  // Views Menu PRD — real admin-saved camera Shots (viewerConfig.
  // cameraPresets, Experience Editor v2's own Camera tab), global state
  // for the same reason Sun & Time's is: it should read as "still
  // selected" if the visitor switches to Units/Explore and back to Views.
  const [activeViewPresetId, setActiveViewPresetId] = useState<string | null>(null);
  const handleSelectViewPreset = useCallback((preset: CameraPreset) => {
    viewerRef.current?.flyToPreset(preset);
    setActiveViewPresetId(preset.id);
  }, []);

  const cameraConfig = useMemo(
    () => ({
      cameraFovDesktop: viewerConfig.cameraFovDesktop,
      cameraFovMobile: viewerConfig.cameraFovMobile,
      cameraNearClip: viewerConfig.cameraNearClip,
      cameraFarClip: viewerConfig.cameraFarClip,
      cameraStartDistanceMultiplier: viewerConfig.cameraStartDistanceMultiplier,
      cameraMinDistanceMultiplier: viewerConfig.cameraMinDistanceMultiplier,
      cameraMaxDistanceMultiplier: viewerConfig.cameraMaxDistanceMultiplier,
      cameraMinPolarDeg: viewerConfig.cameraMinPolarDeg,
      cameraMaxPolarDeg: viewerConfig.cameraMaxPolarDeg,
      cameraMinAzimuthDeg: viewerConfig.cameraMinAzimuthDeg,
      cameraMaxAzimuthDeg: viewerConfig.cameraMaxAzimuthDeg,
      cameraOrbitEnabled: viewerConfig.cameraOrbitEnabled,
      cameraPanEnabled: viewerConfig.cameraPanEnabled,
      cameraZoomEnabled: viewerConfig.cameraZoomEnabled,
      cameraDampingEnabled: viewerConfig.cameraDampingEnabled,
      autoRotate: viewerConfig.autoRotate,
    }),
    [viewerConfig]
  );

  const qualityConfig = useMemo(
    () => ({
      renderingMode: viewerConfig.renderingMode,
      qualityPreset: viewerConfig.qualityPreset,
      customRenderScale: viewerConfig.customRenderScale,
      customDprCap: viewerConfig.customDprCap,
      adaptiveQualityEnabled: viewerConfig.adaptiveQualityEnabled,
      runtimeQualityReductionEnabled: viewerConfig.runtimeQualityReductionEnabled,
      interactionQualityReductionEnabled: viewerConfig.interactionQualityReductionEnabled,
    }),
    [viewerConfig]
  );

  const environmentConfig = useMemo(
    () => ({
      solarControllerEnabled: viewerConfig.solarControllerEnabled,
      solarPathMode: viewerConfig.solarPathMode,
      // Live-scrubbed Sun & Time state (effectiveSunTimeHours/Date) rather
      // than the raw published config — RenderEngine.setEnvironmentConfig
      // is already a live (no-remount) update path, so dragging the
      // Sun & Time slider flows straight through to a live sun position
      // via the exact same prop this object already fed on every load.
      viewerTimeHours: effectiveSunTimeHours,
      solarAnchors: viewerConfig.solarAnchors,
      geoLatitude: viewerConfig.geoLatitude,
      geoLongitude: viewerConfig.geoLongitude,
      simulationDate: effectiveSunDate,
      northOffsetDeg: viewerConfig.northOffsetDeg,
      sunDiscEnabled: viewerConfig.sunDiscEnabled,
      autoSunIntensityEnabled: viewerConfig.autoSunIntensityEnabled,
      autoSunColorEnabled: viewerConfig.autoSunColorEnabled,
      manualSunIntensity: viewerConfig.manualSunIntensity,
      manualSunColorHex: viewerConfig.manualSunColorHex,
      environmentRefreshEnabled: viewerConfig.environmentRefreshEnabled,
      sunAzimuthDeg: viewerConfig.sunAzimuthDeg,
      sunElevationDeg: viewerConfig.sunElevationDeg,
      skyEnabled: viewerConfig.skyEnabled,
      skyTurbidity: viewerConfig.skyTurbidity,
      skyRayleigh: viewerConfig.skyRayleigh,
      skyMieCoefficient: viewerConfig.skyMieCoefficient,
      skyMieDirectionalG: viewerConfig.skyMieDirectionalG,
      environmentIntensity: viewerConfig.environmentIntensity,
      cloudsEnabled: viewerConfig.cloudsEnabled,
      cloudCoverage: viewerConfig.cloudCoverage,
      cloudDensity: viewerConfig.cloudDensity,
      cloudElevation: viewerConfig.cloudElevation,
      cloudMovementEnabled: viewerConfig.cloudMovementEnabled,
      cloudSunLightingEnabled: viewerConfig.cloudSunLightingEnabled,
      cloudShadowsEnabled: viewerConfig.cloudShadowsEnabled,
      cloudHeight: viewerConfig.cloudHeight,
      cloudThickness: viewerConfig.cloudThickness,
      cloudThreshold: viewerConfig.cloudThreshold,
      cloudOpacity: viewerConfig.cloudOpacity,
      cloudSoftness: viewerConfig.cloudSoftness,
      cloudScale: viewerConfig.cloudScale,
      cloudWindSpeed: viewerConfig.cloudWindSpeed,
      cloudWindDirectionDeg: viewerConfig.cloudWindDirectionDeg,
      cloudRaymarchSteps: viewerConfig.cloudRaymarchSteps,
      fogEnabled: viewerConfig.fogEnabled,
      fogColor: viewerConfig.fogColor,
      fogDensity: viewerConfig.fogDensity,
      fogMatchesSky: viewerConfig.fogMatchesSky,
      fogHeightBandEnabled: viewerConfig.fogHeightBandEnabled,
      fogHazeEnabled: viewerConfig.fogHazeEnabled,
      fogNoiseEnabled: viewerConfig.fogNoiseEnabled,
      fogMovementEnabled: viewerConfig.fogMovementEnabled,
      fogSunInteractionEnabled: viewerConfig.fogSunInteractionEnabled,
      fogBaseHeight: viewerConfig.fogBaseHeight,
      fogTopHeight: viewerConfig.fogTopHeight,
      fogHaze: viewerConfig.fogHaze,
      fogNoiseStrength: viewerConfig.fogNoiseStrength,
      fogNoiseScale: viewerConfig.fogNoiseScale,
      fogWindDirectionDeg: viewerConfig.fogWindDirectionDeg,
      fogWindSpeed: viewerConfig.fogWindSpeed,
      fogFalloff: viewerConfig.fogFalloff,
      fogMaxOpacity: viewerConfig.fogMaxOpacity,
      waterEnabled: viewerConfig.waterEnabled,
      waterDistortionScale: viewerConfig.waterDistortionScale,
      waterSize: viewerConfig.waterSize,
      waterType: viewerConfig.waterType,
      waterWavesEnabled: viewerConfig.waterWavesEnabled,
      waterMovementEnabled: viewerConfig.waterMovementEnabled,
      waterSunReflectionEnabled: viewerConfig.waterSunReflectionEnabled,
      waterEnvReflectionEnabled: viewerConfig.waterEnvReflectionEnabled,
      waterNormalMapEnabled: viewerConfig.waterNormalMapEnabled,
      waterHeight: viewerConfig.waterHeight,
      waterColor: viewerConfig.waterColor,
      waterDeepColor: viewerConfig.waterDeepColor,
      groundEnabled: viewerConfig.groundEnabled,
      groundStyle: viewerConfig.groundStyle,
      groundColor: viewerConfig.groundColor,
      groundFogEnabled: viewerConfig.groundFogEnabled,
      groundFogRadius: viewerConfig.groundFogRadius,
    }),
    [viewerConfig, effectiveSunTimeHours, effectiveSunDate]
  );

  const lightingConfig = useMemo(
    () => ({
      sunLightEnabled: viewerConfig.sunLightEnabled,
      sunTemperatureK: viewerConfig.sunTemperatureK,
      autoSunIntensityEnabled: viewerConfig.autoSunIntensityEnabled,
      autoSunColorEnabled: viewerConfig.autoSunColorEnabled,
      manualSunIntensity: viewerConfig.manualSunIntensity,
      manualSunColorHex: viewerConfig.manualSunColorHex,
      csmEnabled: viewerConfig.csmEnabled,
      csmCascades: viewerConfig.csmCascades,
      csmMaxDistance: viewerConfig.csmMaxDistance,
      csmResolution: viewerConfig.csmResolution,
      csmSplitMode: viewerConfig.csmSplitMode,
      csmMargin: viewerConfig.csmMargin,
      softShadowsEnabled: viewerConfig.softShadowsEnabled,
      shadowSoftness: viewerConfig.shadowSoftness,
      shadowsEnabled: viewerConfig.shadowsEnabled,
      contactShadowsEnabled: viewerConfig.contactShadowsEnabled,
      contactShadowBlur: viewerConfig.contactShadowBlur,
      contactShadowDarkness: viewerConfig.contactShadowDarkness,
      contactShadowOpacity: viewerConfig.contactShadowOpacity,
      contactShadowRange: viewerConfig.contactShadowRange,
      transmittedShadowsEnabled: viewerConfig.transmittedShadowsEnabled,
      coloredShadowsEnabled: viewerConfig.coloredShadowsEnabled,
      transmittedShadowStrength: viewerConfig.transmittedShadowStrength,
      giEnabled: viewerConfig.giEnabled,
      giIndirectEnabled: viewerConfig.giIndirectEnabled,
      giAOEnabled: viewerConfig.giAOEnabled,
      giBackfaceLighting: viewerConfig.giBackfaceLighting,
      giTemporalFiltering: viewerConfig.giTemporalFiltering,
      giScreenSpaceSampling: viewerConfig.giScreenSpaceSampling,
      giIntensity: viewerConfig.giIntensity,
      giAOIntensity: viewerConfig.giAOIntensity,
      giRadius: viewerConfig.giRadius,
      giSliceCount: viewerConfig.giSliceCount,
      giStepCount: viewerConfig.giStepCount,
      giExpFactor: viewerConfig.giExpFactor,
      giThickness: viewerConfig.giThickness,
      giLinearThickness: viewerConfig.giLinearThickness,
      artificialLights: viewerConfig.artificialLights,
      volumetricLightingEnabled: viewerConfig.volumetricLightingEnabled,
      sunShaftsEnabled: viewerConfig.sunShaftsEnabled,
      lightVolumesEnabled: viewerConfig.lightVolumesEnabled,
      volumetricRaymarchSteps: viewerConfig.volumetricRaymarchSteps,
      volumetricDensity: viewerConfig.volumetricDensity,
      volumetricMaxDensity: viewerConfig.volumetricMaxDensity,
      volumetricDistanceAtten: viewerConfig.volumetricDistanceAtten,
    }),
    [viewerConfig]
  );

  const renderingConfig = useMemo(
    () => ({
      ssrEnabled: viewerConfig.ssrEnabled,
      ssrIntensity: viewerConfig.ssrIntensity,
      ssrMaxDistance: viewerConfig.ssrMaxDistance,
      ssrThickness: viewerConfig.ssrThickness,
      ssrQuality: viewerConfig.ssrQuality,
      antialiasEnabled: viewerConfig.antialiasEnabled,
      bloomEnabled: viewerConfig.bloomEnabled,
      bloomStrength: viewerConfig.bloomStrength,
      bloomRadius: viewerConfig.bloomRadius,
      lensFlareEnabled: viewerConfig.lensFlareEnabled,
      lensFlareIntensity: viewerConfig.lensFlareIntensity,
      depthOfFieldEnabled: viewerConfig.depthOfFieldEnabled,
      depthOfFieldFocalLength: viewerConfig.depthOfFieldFocalLength,
      depthOfFieldBokehScale: viewerConfig.depthOfFieldBokehScale,
      cameraAutoFocusEnabled: viewerConfig.cameraAutoFocusEnabled,
      motionBlurEnabled: viewerConfig.motionBlurEnabled,
      motionBlurIntensity: viewerConfig.motionBlurIntensity,
      exposure: viewerConfig.exposure,
      toneMapping: viewerConfig.toneMapping,
      lutEnabled: viewerConfig.lutEnabled,
      lutPreset: viewerConfig.lutPreset,
      lutIntensity: viewerConfig.lutIntensity,
    }),
    [viewerConfig]
  );

  // Fullscreen targets this whole page wrapper — not ThreeProjectViewer's
  // own canvas container — specifically so the header (ROZARIS/project
  // name/Full Screen/Screenshot) and the viewer's own bottom icon menu all
  // stay visible in real browser fullscreen instead of disappearing along
  // with the rest of the page chrome.
  function toggleFullscreen() {
    const el = mainRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === mainRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function handleScreenshot() {
    const dataUrl = viewerRef.current?.captureScreenshot();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project.slug}-rozaris.png`;
    a.click();
    // Publish/runtime hardening pass — project.screenshotSaved was
    // already translated in both locales but had zero call sites
    // anywhere in the app; same timeout-flash pattern already used for
    // Project3DConfigEditor.tsx's own savedFlash.
    setScreenshotFlash(true);
    setTimeout(() => setScreenshotFlash(false), 2500);
  }

  // Stable identity required — ThreeProjectViewer deliberately excludes
  // this from its own effect deps (see its onReady doc comment), so a
  // fresh closure every render would just never be the one that's called.
  const handleReady = useCallback(() => setSceneReady(true), []);

  // Units Search Mode PRD, Phase 3 — list→3D half of the sync. Real call
  // regardless of whether *this* project's GLB has any `Unit_*`-named
  // meshes to actually highlight — see RenderEngine.setSelectedUnit's own
  // doc comment for why that's a safe, honest no-op rather than something
  // that needs gating here.
  const handleSelectUnitIn3D = useCallback((unitId: string | null) => {
    viewerRef.current?.setSelectedUnit(unitId);
  }, []);

  return (
    <div id="main-content" ref={mainRef} className="relative flex h-dvh w-full overflow-hidden bg-neutral-900">
      {/* Units Search Mode PRD §3-5 — a real structural viewport column,
          not an overlay/modal: it's a flex sibling of the 3D viewport
          wrapper below, so its own width tween is what actually reflows
          that sibling narrower each frame (see UnitsWorkspace's doc
          comment for why that's deliberate). */}
      <UnitsWorkspace
        open={leftPanelOpen}
        onClose={() => setActiveModule("explore")}
        units={units}
        onSelectUnitIn3D={handleSelectUnitIn3D}
      />

      {/* The 3D viewport + everything positioned relative to it (HUD,
          compare/construction cluster, screenshot flash) — scoped to this
          wrapper rather than the full page so all of it narrows/shifts
          together as UnitsWorkspace opens, instead of staying pinned to
          the full browser width while only the canvas itself moves. */}
      <div className="relative h-full min-w-0 flex-1">
        <ViewerHUD
          viewerRef={viewerRef}
          sceneReady={sceneReady}
          activeModule={activeModule}
          onActiveModuleChange={setActiveModule}
          project={moreMenuProject}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onScreenshot={handleScreenshot}
          screenshotEnabled={viewerConfig.viewerUI.screenshotEnabled !== false}
          fullscreenEnabled={viewerConfig.viewerUI.fullscreenEnabled !== false}
          northOffsetDeg={viewerConfig.northOffsetDeg}
          viewerTimeHours={effectiveSunTimeHours}
          simulationDate={effectiveSunDate}
          sunTimeInteractive={sunTimeInteractive}
          sunTimeBounds={sunTimeBounds}
          sunTimeline={sunTimeline}
          sunTimePresets={sunTimePresets}
          activeSunPreset={activeSunPreset}
          sunTimeCanReset={liveSunTimeHours != null || liveSunDate != null}
          onSunTimeChange={handleSunTimeChange}
          onSunDateChange={handleSunDateChange}
          onSunPresetSelect={handleSunPresetSelect}
          onSunTimeReset={handleSunTimeReset}
          cameraPresets={viewerConfig.cameraPresets}
          activeViewPresetId={activeViewPresetId}
          onSelectViewPreset={handleSelectViewPreset}
        />

        {/* Pre-dates the Front Page rebuild and isn't governed by its PRD
            (compare tray + construction progress) — kept exactly where it
            was, just no longer sharing a header row with project identity
            now that ViewerHUD owns the top-left/top-right corners. */}
        {(compareCount > 0 || (!unitPanelOpen && project.status === "under_construction")) && (
          <div className="absolute right-3 top-[60px] z-20 flex shrink-0 items-stretch gap-2 pr-[env(safe-area-inset-right)] sm:right-4 sm:top-[68px]">
            {compareCount > 0 && (
              <button
                onClick={() => setCompareOverlayOpen(true)}
                className="glass-panel-dark flex items-center gap-1.5 rounded-pill px-3.5 text-xs font-semibold text-white"
              >
                <SquareStack className="h-3.5 w-3.5" />
                {compareCount}
              </button>
            )}
            {!unitPanelOpen && project.status === "under_construction" && (
              <div className="flex items-stretch">
                <ConstructionTimelineStrip
                  stages={construction.stages}
                  overallPercent={construction.progressPercent}
                  compact
                />
              </div>
            )}
          </div>
        )}

        {screenshotFlash && (
          <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
            {t("project.screenshotSaved")}
          </div>
        )}

        <ThreeProjectViewer
          ref={viewerRef}
          detailModels={detailModelEntries}
          cameraConfig={cameraConfig}
          qualityConfig={qualityConfig}
          environmentConfig={environmentConfig}
          lightingConfig={lightingConfig}
          renderingConfig={renderingConfig}
          onReady={handleReady}
          className="relative h-full w-full"
        />
      </div>

      <UnitDiscoveryPanel
        project={project}
        open={unitPanelOpen}
        onClose={() => setUnitPanelOpen(false)}
        onSelectUnit={(u) => {
          setSelectedUnit(u);
          setFullDetailOpen(false);
        }}
      />
      {selectedUnit && !fullDetailOpen && viewerConfig.viewerUI.showUnitInfo !== false && (
        <UnitPreviewCard
          project={project}
          unit={selectedUnit}
          onClose={() => setSelectedUnit(null)}
          onViewDetails={() => setFullDetailOpen(true)}
        />
      )}
      {selectedUnit && fullDetailOpen && viewerConfig.viewerUI.showUnitInfo !== false && (
        <UnitDetailPanel
          project={project}
          unit={selectedUnit}
          onClose={() => setFullDetailOpen(false)}
        />
      )}
    </div>
  );
}
