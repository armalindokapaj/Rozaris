"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Expand, Minimize, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { useProject3DConfig } from "@/hooks/useProject3DConfig";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer, type ThreeProjectViewerHandle } from "@/components/project/ThreeProjectViewer";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitDetailPanel } from "@/components/project/UnitDetailPanel";
import { UnitPreviewCard } from "@/components/project/UnitPreviewCard";
import type { Project, Unit } from "@/lib/types";

/**
 * Experience Editor v2 rebuild (2026-08-15): ThreeProjectViewer's own
 * bottom chrome (Unit Search panel, shadow-map debug HUD, click-to-select
 * in the 3D scene) doesn't exist yet — that's Interaction/Lighting-tab
 * scope for a later phase. Unit selection here works through
 * UnitDiscoveryPanel's search list only for now.
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
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const construction = useProjectConstruction(project);
  const detailModels = useProjectDetailModel(project.id);
  const viewerConfig = useProject3DConfig(project.id);
  const { t } = useT();

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
      viewerTimeHours: viewerConfig.viewerTimeHours,
      solarAnchors: viewerConfig.solarAnchors,
      geoLatitude: viewerConfig.geoLatitude,
      geoLongitude: viewerConfig.geoLongitude,
      simulationDate: viewerConfig.simulationDate,
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
    [viewerConfig]
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

  return (
    <div id="main-content" ref={mainRef} className="relative h-dvh w-full overflow-hidden bg-neutral-900">
      <header className="absolute inset-x-0 top-0 z-30 flex items-stretch justify-between gap-2 p-3 sm:p-4">
        <div className="flex min-w-0 items-stretch gap-2">
          <div className="glass-panel-dark flex min-w-0 items-center gap-3 rounded-panel px-3.5 py-2.5 sm:px-4">
            <Link href="/search" className="hidden shrink-0 font-serif text-sm tracking-[0.14em] text-white sm:block">
              ROZARIS
            </Link>
            <span className="hidden h-5 w-px bg-white/20 sm:block" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{project.name}</p>
              <p className="truncate text-xs text-white/60">
                {project.developer.name} · {project.city}
              </p>
            </div>
          </div>
          {viewerConfig.viewerUI.fullscreenEnabled !== false && (
            <button
              onClick={toggleFullscreen}
              aria-label={t("unit.viewerFullscreen")}
              className="glass-panel-dark flex shrink-0 items-center justify-center rounded-panel px-3.5 text-white sm:px-4"
            >
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </button>
          )}
          {viewerConfig.viewerUI.screenshotEnabled !== false && (
            <button
              onClick={handleScreenshot}
              aria-label={t("project.screenshot")}
              className="glass-panel-dark flex shrink-0 items-center justify-center rounded-panel px-3.5 text-white sm:px-4"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-stretch gap-2">
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
      </header>

      {screenshotFlash && (
        <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
          {t("project.screenshotSaved")}
        </div>
      )}

      <ThreeProjectViewer
        ref={viewerRef}
        detailModels={detailModels}
        cameraConfig={cameraConfig}
        qualityConfig={qualityConfig}
        environmentConfig={environmentConfig}
        lightingConfig={lightingConfig}
        renderingConfig={renderingConfig}
        className="relative h-full w-full"
      />

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
