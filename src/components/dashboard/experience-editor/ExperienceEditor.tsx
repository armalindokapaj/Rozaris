"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, ShieldCheck } from "lucide-react";
import { useDetailModelSlots, type DetailVersionRow } from "@/hooks/useDetailModelSlots";
import { useModelEditor, type ModelSwitches, type ModelTransform } from "@/hooks/useModelEditor";
import { useProjectConfigEditor } from "@/hooks/useProjectConfigEditor";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import { EditorTopBar } from "./EditorTopBar";
import { SceneNavigator } from "./SceneNavigator";
import { EditorViewport } from "./EditorViewport";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import type { EditorTabId } from "./tabs";
import type { NodeOverride, Project, ProjectDetailModel } from "@/lib/types";

/** Builds the ProjectDetailModel the viewport actually renders from the
 * server row's static fields (glbUrl/fileName/...) plus the LIVE editor
 * draft (transform/switches/overrides) — so Scene/Materials-tab edits show
 * in the viewport immediately, before Save. */
function detailModelFromDraft(
  version: DetailVersionRow,
  transform: ModelTransform,
  switches: ModelSwitches,
  overrides: NodeOverride[]
): ProjectDetailModel {
  return {
    glbUrl: version.publicAssetUrl,
    fileName: version.fileName,
    fileSize: version.fileSize,
    scale: transform.scale,
    rotationDeg: transform.rotationDeg,
    altitudeOffset: transform.altitudeOffset,
    positionX: transform.positionX,
    positionZ: transform.positionZ,
    rotationXDeg: transform.rotationXDeg,
    rotationZDeg: transform.rotationZDeg,
    enabled: switches.modelEnabled,
    visible: switches.modelVisible,
    castShadow: switches.castShadow,
    receiveShadow: switches.receiveShadow,
    selectable: switches.selectable,
    transformLocked: switches.transformLocked,
    updatedAt: version.createdAt,
    unitLinks: version.unitLinks.map((l) => ({
      meshName: l.meshName,
      unitId: l.unitId,
      poiYawDeg: l.poiYawDeg,
      poiEnabled: l.poiEnabled,
      poiDistanceOverride: l.poiDistanceOverride,
      poiHeightOverride: l.poiHeightOverride,
    })),
    sceneManifest: (version.sceneManifest as ProjectDetailModel["sceneManifest"]) ?? [],
    nodeOverrides: overrides,
    triangleCount: null,
    meshCount: null,
    materialCount: null,
    textureCount: null,
  };
}

/** Units Blocks & POI Layer PRD — every OTHER (non-active) slot's own
 * latest version, read-only (no live draft overrides — those only exist
 * for whichever slot the Scene/Materials tabs currently have open),
 * straight from its own stored fields. Lets Building + Units (+
 * Surroundings/Context) all render together in the editor's own preview,
 * same as the public viewer already composites every published slot —
 * previously the editor only ever rendered the single active-tab slot,
 * which made a Units slot's placement/POI camera impossible to actually
 * see against the building while authoring it. */
function detailModelFromVersion(version: DetailVersionRow): ProjectDetailModel {
  return {
    glbUrl: version.publicAssetUrl,
    fileName: version.fileName,
    fileSize: version.fileSize,
    scale: version.scale,
    rotationDeg: version.rotationDeg,
    altitudeOffset: version.altitudeOffset,
    positionX: version.positionX,
    positionZ: version.positionZ,
    rotationXDeg: version.rotationXDeg,
    rotationZDeg: version.rotationZDeg,
    enabled: version.modelEnabled,
    visible: version.modelVisible,
    castShadow: version.castShadow,
    receiveShadow: version.receiveShadow,
    selectable: version.selectable,
    transformLocked: version.transformLocked,
    updatedAt: version.createdAt,
    unitLinks: version.unitLinks.map((l) => ({
      meshName: l.meshName,
      unitId: l.unitId,
      poiYawDeg: l.poiYawDeg,
      poiEnabled: l.poiEnabled,
      poiDistanceOverride: l.poiDistanceOverride,
      poiHeightOverride: l.poiHeightOverride,
    })),
    sceneManifest: (version.sceneManifest as ProjectDetailModel["sceneManifest"]) ?? [],
    nodeOverrides: (version.nodeOverrides as ProjectDetailModel["nodeOverrides"]) ?? [],
    triangleCount: null,
    meshCount: null,
    materialCount: null,
    textureCount: null,
  };
}

/**
 * ROZARIS Experience Editor — full-page shell, ground-up rebuild
 * (2026-08-15). Replaces the deleted Project3DConfigEditor.tsx/
 * EditorShell.tsx at the same route.
 */
export function ExperienceEditor({
  project,
  onClose,
  onDeleteProject,
  deletingProject,
}: {
  project: Project;
  onClose: () => void;
  onDeleteProject: () => void;
  deletingProject: boolean;
}) {
  const [activeTab, setActiveTab] = useState<EditorTabId>("scene");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [perfStats, setPerfStats] = useState<{
    fps: number;
    frameTimeMs: number;
    drawCalls: number;
    triangles: number;
    textures: number;
    dpr: number;
  } | null>(null);
  const [statusPreviewEnabled, setStatusPreviewEnabled] = useState(true);
  const [effectiveRenderScale, setEffectiveRenderScale] = useState<number | null>(null);
  const viewerRef = useRef<ThreeProjectViewerHandle>(null);
  const detail = useDetailModelSlots(project.id);
  const modelEditor = useModelEditor(project.id, detail.activeVersion, detail.canEditDetail);
  const configEditor = useProjectConfigEditor(project.id, true);
  const { units } = useProjectUnits(project.id);

  const detailModels = useMemo(() => {
    const entries = detail.slots.flatMap((slot) => {
      const isActive = slot.id === detail.activeSlotId;
      const model = isActive
        ? detail.activeVersion
          ? {
              ...detailModelFromDraft(detail.activeVersion, modelEditor.transform, modelEditor.switches, modelEditor.overrides),
              unitLinks: modelEditor.links,
            }
          : null
        : (detail.versionsBySlot[slot.id]?.[0] && detailModelFromVersion(detail.versionsBySlot[slot.id][0])) ?? null;
      if (!model) return [];
      return [
        {
          slotId: slot.id,
          model,
          units: units ?? undefined,
          statusPreviewEnabled,
          slotRole: slot.role,
          transformParentSlotId: slot.transformParentSlotId,
        },
      ];
    });
    return entries;
  }, [detail.slots, detail.activeSlotId, detail.activeVersion, detail.versionsBySlot, modelEditor.transform, modelEditor.switches, modelEditor.overrides, modelEditor.links, units, statusPreviewEnabled]);

  const unitsConfig = useMemo(
    () => ({
      unitColorAvailable: configEditor.draft.unitColorAvailable,
      unitColorReserved: configEditor.draft.unitColorReserved,
      unitColorSold: configEditor.draft.unitColorSold,
      unitColorSelected: configEditor.draft.unitColorSelected,
      unitBlocksEnabled: configEditor.draft.unitBlocksEnabled,
      unitBlocksStatusColorsEnabled: configEditor.draft.unitBlocksStatusColorsEnabled,
      unitBlocksXrayEnabled: configEditor.draft.unitBlocksXrayEnabled,
      unitBlocksDefaultOpacity: configEditor.draft.unitBlocksDefaultOpacity,
      unitBlocksHoverOpacity: configEditor.draft.unitBlocksHoverOpacity,
      unitBlocksSelectedOpacity: configEditor.draft.unitBlocksSelectedOpacity,
      unitBlocksSelectedOutlineEnabled: configEditor.draft.unitBlocksSelectedOutlineEnabled,
      unitPoiCameraEnabled: configEditor.draft.unitPoiCameraEnabled,
      unitPoiCameraFov: configEditor.draft.unitPoiCameraFov,
      unitPoiCameraDistanceMultiplier: configEditor.draft.unitPoiCameraDistanceMultiplier,
      unitPoiCameraHeightOffset: configEditor.draft.unitPoiCameraHeightOffset,
      unitPoiTransitionMs: configEditor.draft.unitPoiTransitionMs,
      unitPoiAutoOcclusionCorrection: configEditor.draft.unitPoiAutoOcclusionCorrection,
    }),
    [configEditor.draft]
  );

  const cameraConfig = useMemo(
    () => ({
      cameraFovDesktop: configEditor.draft.cameraFovDesktop,
      cameraFovMobile: configEditor.draft.cameraFovMobile,
      cameraNearClip: configEditor.draft.cameraNearClip,
      cameraFarClip: configEditor.draft.cameraFarClip,
      cameraStartDistanceMultiplier: configEditor.draft.cameraStartDistanceMultiplier,
      cameraMinDistanceMultiplier: configEditor.draft.cameraMinDistanceMultiplier,
      cameraMaxDistanceMultiplier: configEditor.draft.cameraMaxDistanceMultiplier,
      cameraMinPolarDeg: configEditor.draft.cameraMinPolarDeg,
      cameraMaxPolarDeg: configEditor.draft.cameraMaxPolarDeg,
      cameraMinAzimuthDeg: configEditor.draft.cameraMinAzimuthDeg,
      cameraMaxAzimuthDeg: configEditor.draft.cameraMaxAzimuthDeg,
      cameraOrbitEnabled: configEditor.draft.cameraOrbitEnabled,
      cameraPanEnabled: configEditor.draft.cameraPanEnabled,
      cameraZoomEnabled: configEditor.draft.cameraZoomEnabled,
      cameraDampingEnabled: configEditor.draft.cameraDampingEnabled,
      autoRotate: configEditor.draft.autoRotate,
      idleDroneEnabled: configEditor.draft.idleDroneEnabled,
      idleDroneDelaySec: configEditor.draft.idleDroneDelaySec,
      idleDroneOrbitDurationSec: configEditor.draft.idleDroneOrbitDurationSec,
      idleDroneClockwise: configEditor.draft.idleDroneClockwise,
      idleDroneMotionEnabled: configEditor.draft.idleDroneMotionEnabled,
      idleDroneHeightEnabled: configEditor.draft.idleDroneHeightEnabled,
      idleDroneHeightAmplitude: configEditor.draft.idleDroneHeightAmplitude,
      idleDroneDistanceEnabled: configEditor.draft.idleDroneDistanceEnabled,
      idleDroneDistanceAmplitude: configEditor.draft.idleDroneDistanceAmplitude,
      idleDroneTargetEnabled: configEditor.draft.idleDroneTargetEnabled,
      idleDroneTargetAmplitude: configEditor.draft.idleDroneTargetAmplitude,
      idleDroneVerticalCycles: configEditor.draft.idleDroneVerticalCycles,
      idleDronePhaseOffsetDeg: configEditor.draft.idleDronePhaseOffsetDeg,
      idleDroneSmoothness: configEditor.draft.idleDroneSmoothness,
    }),
    [configEditor.draft]
  );

  const qualityConfig = useMemo(
    () => ({
      renderingMode: configEditor.draft.renderingMode,
      qualityPreset: configEditor.draft.qualityPreset,
      customRenderScale: configEditor.draft.customRenderScale,
      customDprCap: configEditor.draft.customDprCap,
      adaptiveQualityEnabled: configEditor.draft.adaptiveQualityEnabled,
      runtimeQualityReductionEnabled: configEditor.draft.runtimeQualityReductionEnabled,
      interactionQualityReductionEnabled: configEditor.draft.interactionQualityReductionEnabled,
    }),
    [configEditor.draft]
  );

  const environmentConfig = useMemo(
    () => ({
      solarControllerEnabled: configEditor.draft.solarControllerEnabled,
      solarPathMode: configEditor.draft.solarPathMode,
      viewerTimeHours: configEditor.draft.viewerTimeHours,
      solarAnchors: configEditor.draft.solarAnchors,
      geoLatitude: configEditor.draft.geoLatitude,
      geoLongitude: configEditor.draft.geoLongitude,
      simulationDate: configEditor.draft.simulationDate,
      northOffsetDeg: configEditor.draft.northOffsetDeg,
      sunDiscEnabled: configEditor.draft.sunDiscEnabled,
      autoSunIntensityEnabled: configEditor.draft.autoSunIntensityEnabled,
      autoSunColorEnabled: configEditor.draft.autoSunColorEnabled,
      manualSunIntensity: configEditor.draft.manualSunIntensity,
      manualSunColorHex: configEditor.draft.manualSunColorHex,
      environmentRefreshEnabled: configEditor.draft.environmentRefreshEnabled,
      sunAzimuthDeg: configEditor.draft.sunAzimuthDeg,
      sunElevationDeg: configEditor.draft.sunElevationDeg,
      skyEnabled: configEditor.draft.skyEnabled,
      skyTurbidity: configEditor.draft.skyTurbidity,
      skyRayleigh: configEditor.draft.skyRayleigh,
      skyMieCoefficient: configEditor.draft.skyMieCoefficient,
      skyMieDirectionalG: configEditor.draft.skyMieDirectionalG,
      environmentIntensity: configEditor.draft.environmentIntensity,
      cloudsEnabled: configEditor.draft.cloudsEnabled,
      cloudCoverage: configEditor.draft.cloudCoverage,
      cloudDensity: configEditor.draft.cloudDensity,
      cloudElevation: configEditor.draft.cloudElevation,
      cloudMovementEnabled: configEditor.draft.cloudMovementEnabled,
      cloudSunLightingEnabled: configEditor.draft.cloudSunLightingEnabled,
      cloudShadowsEnabled: configEditor.draft.cloudShadowsEnabled,
      cloudHeight: configEditor.draft.cloudHeight,
      cloudThickness: configEditor.draft.cloudThickness,
      cloudThreshold: configEditor.draft.cloudThreshold,
      cloudOpacity: configEditor.draft.cloudOpacity,
      cloudSoftness: configEditor.draft.cloudSoftness,
      cloudScale: configEditor.draft.cloudScale,
      cloudWindSpeed: configEditor.draft.cloudWindSpeed,
      cloudWindDirectionDeg: configEditor.draft.cloudWindDirectionDeg,
      cloudRaymarchSteps: configEditor.draft.cloudRaymarchSteps,
      fogEnabled: configEditor.draft.fogEnabled,
      fogColor: configEditor.draft.fogColor,
      fogDensity: configEditor.draft.fogDensity,
      fogMatchesSky: configEditor.draft.fogMatchesSky,
      fogHeightBandEnabled: configEditor.draft.fogHeightBandEnabled,
      fogHazeEnabled: configEditor.draft.fogHazeEnabled,
      fogNoiseEnabled: configEditor.draft.fogNoiseEnabled,
      fogMovementEnabled: configEditor.draft.fogMovementEnabled,
      fogSunInteractionEnabled: configEditor.draft.fogSunInteractionEnabled,
      fogBaseHeight: configEditor.draft.fogBaseHeight,
      fogTopHeight: configEditor.draft.fogTopHeight,
      fogHaze: configEditor.draft.fogHaze,
      fogNoiseStrength: configEditor.draft.fogNoiseStrength,
      fogNoiseScale: configEditor.draft.fogNoiseScale,
      fogWindDirectionDeg: configEditor.draft.fogWindDirectionDeg,
      fogWindSpeed: configEditor.draft.fogWindSpeed,
      fogFalloff: configEditor.draft.fogFalloff,
      fogMaxOpacity: configEditor.draft.fogMaxOpacity,
      waterEnabled: configEditor.draft.waterEnabled,
      waterDistortionScale: configEditor.draft.waterDistortionScale,
      waterSize: configEditor.draft.waterSize,
      waterType: configEditor.draft.waterType,
      waterWavesEnabled: configEditor.draft.waterWavesEnabled,
      waterMovementEnabled: configEditor.draft.waterMovementEnabled,
      waterSunReflectionEnabled: configEditor.draft.waterSunReflectionEnabled,
      waterEnvReflectionEnabled: configEditor.draft.waterEnvReflectionEnabled,
      waterNormalMapEnabled: configEditor.draft.waterNormalMapEnabled,
      waterHeight: configEditor.draft.waterHeight,
      waterColor: configEditor.draft.waterColor,
      waterDeepColor: configEditor.draft.waterDeepColor,
      groundEnabled: configEditor.draft.groundEnabled,
      groundStyle: configEditor.draft.groundStyle,
      groundColor: configEditor.draft.groundColor,
      groundFogEnabled: configEditor.draft.groundFogEnabled,
      groundFogRadius: configEditor.draft.groundFogRadius,
    }),
    [configEditor.draft]
  );

  const lightingConfig = useMemo(
    () => ({
      sunLightEnabled: configEditor.draft.sunLightEnabled,
      sunTemperatureK: configEditor.draft.sunTemperatureK,
      autoSunIntensityEnabled: configEditor.draft.autoSunIntensityEnabled,
      autoSunColorEnabled: configEditor.draft.autoSunColorEnabled,
      manualSunIntensity: configEditor.draft.manualSunIntensity,
      manualSunColorHex: configEditor.draft.manualSunColorHex,
      csmEnabled: configEditor.draft.csmEnabled,
      csmCascades: configEditor.draft.csmCascades,
      csmMaxDistance: configEditor.draft.csmMaxDistance,
      csmResolution: configEditor.draft.csmResolution,
      csmSplitMode: configEditor.draft.csmSplitMode,
      csmMargin: configEditor.draft.csmMargin,
      softShadowsEnabled: configEditor.draft.softShadowsEnabled,
      shadowSoftness: configEditor.draft.shadowSoftness,
      shadowsEnabled: configEditor.draft.shadowsEnabled,
      contactShadowsEnabled: configEditor.draft.contactShadowsEnabled,
      contactShadowBlur: configEditor.draft.contactShadowBlur,
      contactShadowDarkness: configEditor.draft.contactShadowDarkness,
      contactShadowOpacity: configEditor.draft.contactShadowOpacity,
      contactShadowRange: configEditor.draft.contactShadowRange,
      transmittedShadowsEnabled: configEditor.draft.transmittedShadowsEnabled,
      coloredShadowsEnabled: configEditor.draft.coloredShadowsEnabled,
      transmittedShadowStrength: configEditor.draft.transmittedShadowStrength,
      giEnabled: configEditor.draft.giEnabled,
      giIndirectEnabled: configEditor.draft.giIndirectEnabled,
      giAOEnabled: configEditor.draft.giAOEnabled,
      giBackfaceLighting: configEditor.draft.giBackfaceLighting,
      giTemporalFiltering: configEditor.draft.giTemporalFiltering,
      giScreenSpaceSampling: configEditor.draft.giScreenSpaceSampling,
      giIntensity: configEditor.draft.giIntensity,
      giAOIntensity: configEditor.draft.giAOIntensity,
      giRadius: configEditor.draft.giRadius,
      giSliceCount: configEditor.draft.giSliceCount,
      giStepCount: configEditor.draft.giStepCount,
      giExpFactor: configEditor.draft.giExpFactor,
      giThickness: configEditor.draft.giThickness,
      giLinearThickness: configEditor.draft.giLinearThickness,
      artificialLights: configEditor.draft.artificialLights,
      volumetricLightingEnabled: configEditor.draft.volumetricLightingEnabled,
      sunShaftsEnabled: configEditor.draft.sunShaftsEnabled,
      lightVolumesEnabled: configEditor.draft.lightVolumesEnabled,
      volumetricRaymarchSteps: configEditor.draft.volumetricRaymarchSteps,
      volumetricDensity: configEditor.draft.volumetricDensity,
      volumetricMaxDensity: configEditor.draft.volumetricMaxDensity,
      volumetricDistanceAtten: configEditor.draft.volumetricDistanceAtten,
    }),
    [configEditor.draft]
  );

  const renderingConfig = useMemo(
    () => ({
      ssrEnabled: configEditor.draft.ssrEnabled,
      ssrIntensity: configEditor.draft.ssrIntensity,
      ssrMaxDistance: configEditor.draft.ssrMaxDistance,
      ssrThickness: configEditor.draft.ssrThickness,
      ssrQuality: configEditor.draft.ssrQuality,
      antialiasEnabled: configEditor.draft.antialiasEnabled,
      bloomEnabled: configEditor.draft.bloomEnabled,
      bloomStrength: configEditor.draft.bloomStrength,
      bloomRadius: configEditor.draft.bloomRadius,
      lensFlareEnabled: configEditor.draft.lensFlareEnabled,
      lensFlareIntensity: configEditor.draft.lensFlareIntensity,
      depthOfFieldEnabled: configEditor.draft.depthOfFieldEnabled,
      depthOfFieldFocalLength: configEditor.draft.depthOfFieldFocalLength,
      depthOfFieldBokehScale: configEditor.draft.depthOfFieldBokehScale,
      cameraAutoFocusEnabled: configEditor.draft.cameraAutoFocusEnabled,
      motionBlurEnabled: configEditor.draft.motionBlurEnabled,
      motionBlurIntensity: configEditor.draft.motionBlurIntensity,
      exposure: configEditor.draft.exposure,
      toneMapping: configEditor.draft.toneMapping,
      lutEnabled: configEditor.draft.lutEnabled,
      lutPreset: configEditor.draft.lutPreset,
      lutIntensity: configEditor.draft.lutIntensity,
    }),
    [configEditor.draft]
  );

  function handleGroundAlign() {
    const slotId = detail.activeSlotId;
    if (!slotId) return;
    const offset = viewerRef.current?.computeGroundAlignOffset(slotId);
    if (offset != null) modelEditor.groundAlign(offset);
  }

  // Units Blocks & POI Layer PRD §13 — "Units mode" only shows/allows
  // interaction with unit blocks while the Units tab is actually open, so
  // the X-ray overlay doesn't obstruct the Materials/Environment/etc.
  // tabs' own preview of the architectural model.
  useEffect(() => {
    viewerRef.current?.setUnitsMode(activeTab === "units");
  }, [activeTab]);

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-center">
        <ShieldCheck className="h-8 w-8 text-neutral-700" />
        <p className="text-sm text-neutral-400">Project not found.</p>
        <button onClick={onClose} className="text-sm font-semibold text-indigo-400 hover:underline">
          Back to admin console
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-950">
      <EditorTopBar
        projectName={project.name}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        detail={detail}
        modelEditor={modelEditor}
        configEditor={configEditor}
        locale="en"
      />
      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <div className="w-[260px] shrink-0">
            <SceneNavigator slotNames={detail.slots.map((s) => s.name)} />
          </div>
        ) : null}
        <button
          onClick={() => setLeftOpen((v) => !v)}
          title={leftOpen ? "Collapse Scene panel" : "Expand Scene panel"}
          className="flex w-5 shrink-0 items-center justify-center border-r border-neutral-800 bg-neutral-950 text-neutral-600 hover:text-neutral-300"
        >
          {leftOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        </button>

        <EditorViewport
          ref={viewerRef}
          detailModels={detailModels}
          slotsLoaded={detail.slotsLoaded}
          cameraConfig={cameraConfig}
          qualityConfig={qualityConfig}
          environmentConfig={environmentConfig}
          lightingConfig={lightingConfig}
          renderingConfig={renderingConfig}
          unitsConfig={unitsConfig}
          onPerfStats={(stats) => {
            setPerfStats(stats);
            setEffectiveRenderScale(viewerRef.current?.getEffectiveRenderScale() ?? null);
          }}
        />

        <button
          onClick={() => setRightOpen((v) => !v)}
          title={rightOpen ? "Collapse Inspector panel" : "Expand Inspector panel"}
          className="flex w-5 shrink-0 items-center justify-center border-l border-neutral-800 bg-neutral-950 text-neutral-600 hover:text-neutral-300"
        >
          {rightOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
        </button>
        {rightOpen ? (
          <div className="w-[340px] shrink-0">
            <Inspector
              activeTab={activeTab}
              project={project}
              detail={detail}
              modelEditor={modelEditor}
              configEditor={configEditor}
              viewerRef={viewerRef}
              units={units}
              statusPreviewEnabled={statusPreviewEnabled}
              onStatusPreviewChange={setStatusPreviewEnabled}
              onGroundAlign={handleGroundAlign}
              locale="en"
            />
          </div>
        ) : null}
      </div>
      <StatusBar stats={perfStats} qualityPreset={configEditor.draft.qualityPreset} effectiveRenderScale={effectiveRenderScale} />
      <button
        onClick={onDeleteProject}
        disabled={deletingProject}
        className="sr-only focus:not-sr-only focus:fixed focus:bottom-2 focus:left-2 focus:z-50 focus:rounded focus:bg-red-600 focus:px-3 focus:py-1.5 focus:text-xs focus:text-white"
      >
        {deletingProject ? "Deleting…" : "Delete project"}
      </button>
    </div>
  );
}
