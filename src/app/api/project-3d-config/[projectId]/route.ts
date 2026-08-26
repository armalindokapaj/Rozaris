import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";
import { LUT_PRESET_IDS } from "@/lib/viewerPresets";

const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

const cameraPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: vector3Schema,
  target: vector3Schema,
  fov: z.number().min(10).max(120),
  durationMs: z.number().min(0).max(10_000),
});

const viewerUISchema = z.object({
  home: z.boolean(),
  unitSearch: z.boolean(),
  // Interaction toggles (full-configurator pass) — optional since existing
  // rows predate these keys; client-side default is `true` (see
  // ViewerUIToggles in src/lib/types.ts).
  hoverEnabled: z.boolean().optional(),
  selectEnabled: z.boolean().optional(),
  showUnitInfo: z.boolean().optional(),
  // Sections module — same optional/defaults-true pattern as the three
  // toggles above.
  sectionsEnabled: z.boolean().optional(),
  sunPresetEnabled: z.boolean().optional(),
  // Experience Editor v2, Interaction tab (PRD §39) additions — same
  // optional/defaults-true pattern.
  unitInteractionEnabled: z.boolean().optional(),
  highlightEnabled: z.boolean().optional(),
  statusColorsEnabled: z.boolean().optional(),
  isolationEnabled: z.boolean().optional(),
  floorIsolationEnabled: z.boolean().optional(),
  unitPageLinkEnabled: z.boolean().optional(),
  filtersEnabled: z.boolean().optional(),
  filterFloorEnabled: z.boolean().optional(),
  filterAvailabilityEnabled: z.boolean().optional(),
  filterBedroomsEnabled: z.boolean().optional(),
  filterTypeEnabled: z.boolean().optional(),
  filterPriceEnabled: z.boolean().optional(),
  resetEnabled: z.boolean().optional(),
  fullscreenEnabled: z.boolean().optional(),
  shotsMenuEnabled: z.boolean().optional(),
  screenshotEnabled: z.boolean().optional(),
  shareEnabled: z.boolean().optional(),
});

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb hex color");

// Environment → Sun & Sky's Manual Time + Sun system (PRD §9) — mirrors
// the `SolarAnchor` TS interface (src/lib/sunPosition.ts) field-for-field.
const solarAnchorSchema = z.object({
  id: z.string().min(1),
  timeHours: z.number().min(0).max(24),
  elevationDeg: z.number().min(-90).max(90),
  azimuthDeg: z.number().min(0).max(360),
});

// Lighting → Artificial Lights (PRD §20) — mirrors the `ArtificialLight`
// TS interface (src/lib/types.ts) field-for-field.
const artificialLightSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  type: z.enum(["point", "spot", "ies", "rect"]),
  enabled: z.boolean(),
  shadowsEnabled: z.boolean(),
  volumetricEnabled: z.boolean(),
  helperEnabled: z.boolean(),
  position: vector3Schema,
  target: vector3Schema,
  colorHex: hexColorSchema,
  temperatureK: z.number().min(1000).max(40000).nullable(),
  intensity: z.number().min(0).max(1000),
  distance: z.number().min(0).max(2000),
  decay: z.number().min(0).max(4),
  angleDeg: z.number().min(0.1).max(89),
  penumbra: z.number().min(0).max(1),
  width: z.number().min(0.01).max(500),
  height: z.number().min(0.01).max(500),
  iesProfileUrl: z.string().url().nullable(),
});

// Sections module — mirrors the `Section` TS interface (src/lib/types.ts)
// field-for-field; same validate-at-the-edge role cameraPresetSchema
// already plays for cameraPresets.
const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scope: z.enum(["project", "building"]),
  buildingName: z.string().optional(),
  centerX: z.number(),
  centerZ: z.number(),
  // Real bug fix (2026-08-14, "resize doesn't save"): 500 was too tight
  // for a genuine "cut the whole project/site" section — the Resize
  // gizmo let an admin drag well past it (no client-side ceiling existed
  // either, see EditorShell.tsx's own fix), so the PATCH silently 400'd
  // and the edit never persisted. 5000m covers any real project's full
  // site footprint with headroom; still a real, finite sanity bound, not
  // `Infinity` (a > 5km "section" is certainly a mis-drag, not an
  // intentional cut).
  // `.min(0)`, not `.positive()`: the panel's Width/Depth sliders bottom
  // out at 0 (a fully-collapsed footprint — degenerate to look at, but
  // recoverable by dragging back, and NOT something that should silently
  // 400 mid-drag the way `.positive()` made it).
  widthM: z.number().min(0).max(5000),
  depthM: z.number().min(0).max(5000),
  rotationDeg: z.number().min(-360).max(360),
  heightM: z.number().min(-50).max(500),
  bottomEnabled: z.boolean(),
  // Real user request ("I want only plane Y to clip") — see Section.
  // heightOnly's own doc comment in src/lib/types.ts.
  heightOnly: z.boolean().optional(),
  fillGapsEnabled: z.boolean(),
  fillColor: hexColorSchema,
  cameraPreset: z.object({ position: vector3Schema, target: vector3Schema, fov: z.number().min(10).max(120) }).optional(),
  floorId: z.string().optional(),
  hidden: z.boolean().optional(),
});

/**
 * "3D Experience Phase 1" — makes `Project3DConfig` real (it was 100% dead
 * before this pass: a Zustand-only record, zero API routes touching the
 * Postgres table of the same name — see the "3D Experience — Planpoint-
 * style rendering, Phase 1" plan). `GET` is public (every visitor's
 * `useProject3DConfig` reads it); `PATCH` is admin-gated via
 * `src/lib/adminAuth.ts`, same pattern as `/api/map-models/[projectId]`.
 * One mutable row per project (not versioned like the GLB pipelines —
 * this is live-editable scalar config, not an immutable asset upload).
 */
const patchSchema = z.object({
  groundEnabled: z.boolean().optional(),
  groundStyle: z.enum(["disc", "infinite"]).optional(),
  groundColor: hexColorSchema.optional(),
  groundFogEnabled: z.boolean().optional(),
  groundFogRadius: z.number().min(1).max(20_000).optional(),
  cameraStartDistanceMultiplier: z.number().positive().max(10).optional(),
  cameraMinDistanceMultiplier: z.number().positive().max(10).optional(),
  cameraMaxDistanceMultiplier: z.number().positive().max(20).optional(),
  cameraMaxPolarDeg: z.number().min(0).max(180).optional(),
  cameraMinPolarDeg: z.number().min(0).max(180).optional(),
  autoRotate: z.boolean().optional(),
  // Idle Drone Camera PRD §11 — exact recommended ranges.
  idleDroneEnabled: z.boolean().optional(),
  idleDroneDelaySec: z.number().min(5).max(600).optional(),
  idleDroneOrbitDurationSec: z.number().min(20).max(300).optional(),
  idleDroneClockwise: z.boolean().optional(),
  idleDroneMotionEnabled: z.boolean().optional(),
  idleDroneHeightEnabled: z.boolean().optional(),
  idleDroneHeightAmplitude: z.number().min(0).max(0.5).optional(),
  idleDroneDistanceEnabled: z.boolean().optional(),
  idleDroneDistanceAmplitude: z.number().min(0).max(0.25).optional(),
  idleDroneTargetEnabled: z.boolean().optional(),
  idleDroneTargetAmplitude: z.number().min(0).max(0.25).optional(),
  idleDroneVerticalCycles: z.number().int().min(1).max(4).optional(),
  idleDronePhaseOffsetDeg: z.number().min(0).max(360).optional(),
  idleDroneSmoothness: z.number().min(0).max(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
  renderingMode: z.enum(["auto", "webgpu", "webgl2"]).optional(),
  qualityPreset: z.enum(["ultra_desktop", "high_desktop", "balanced", "mobile_high", "mobile_low", "custom"]).optional(),
  // Experience Editor v2, Performance tab (PRD §40) additions.
  customRenderScale: z.number().min(0.1).max(2).nullable().optional(),
  customDprCap: z.number().min(0.5).max(3).nullable().optional(),
  adaptiveQualityEnabled: z.boolean().optional(),
  runtimeQualityReductionEnabled: z.boolean().optional(),
  interactionQualityReductionEnabled: z.boolean().optional(),
  deviceDetectionEnabled: z.boolean().optional(),
  glassPreset: z.enum(["performance", "standard", "premium"]).optional(),
  environmentIntensity: z.number().min(0).max(4).optional(),
  cameraFovDesktop: z.number().min(10).max(120).optional(),
  cameraFovMobile: z.number().min(10).max(120).optional(),
  // Experience Editor v2, Camera tab (PRD §37) additions.
  cameraNearClip: z.number().min(0.001).max(100).optional(),
  cameraFarClip: z.number().min(10).max(100_000).optional(),
  cameraMinAzimuthDeg: z.number().min(-360).max(360).nullable().optional(),
  cameraMaxAzimuthDeg: z.number().min(-360).max(360).nullable().optional(),
  cameraOrbitEnabled: z.boolean().optional(),
  cameraPanEnabled: z.boolean().optional(),
  cameraZoomEnabled: z.boolean().optional(),
  cameraDampingEnabled: z.boolean().optional(),
  cameraAutoFocusEnabled: z.boolean().optional(),
  cameraHelperEnabled: z.boolean().optional(),
  cameraSensorWidthMm: z.number().min(1).max(100).optional(),
  cameraPresets: z.array(cameraPresetSchema).optional(),
  exposure: z.number().min(0).max(4).optional(),
  toneMapping: z.enum(["none", "linear", "reinhard", "cineon", "aces", "agx", "neutral"]).optional(),
  viewerUI: viewerUISchema.optional(),
  // Sky/Water/Bloom/Clouds "Ocean" tab — direct sun elevation/azimuth,
  // the only sun model now (the old geographic-sun/HDRI/lensflare/
  // light-probe/motion-blur system was removed entirely 2026-08-14, see
  // Project3DConfig's own doc comment in src/lib/types.ts).
  sunAzimuthDeg: z.number().min(0).max(360).optional(),
  sunElevationDeg: z.number().min(-90).max(90).optional(),
  // Experience Editor v2, Environment → Sun & Sky (PRD §9-10) — the
  // "ROZARIS Manual Time + Sun System" / "ONE Global Sun". See
  // Project3DConfig's own doc comment in prisma/schema.prisma.
  solarControllerEnabled: z.boolean().optional(),
  solarPathMode: z.enum(["manual", "geographic"]).optional(),
  viewerTimeControlEnabled: z.boolean().optional(),
  viewerTimeHours: z.number().min(0).max(24).optional(),
  viewerTimeStartHours: z.number().min(0).max(24).optional(),
  viewerTimeEndHours: z.number().min(0).max(24).optional(),
  viewerTimeStepMinutes: z.number().int().min(1).max(240).optional(),
  solarAnchors: z.array(solarAnchorSchema).max(24).optional(),
  geoLatitude: z.number().min(-90).max(90).optional(),
  geoLongitude: z.number().min(-180).max(180).optional(),
  simulationDate: z.coerce.date().optional(),
  northOffsetDeg: z.number().min(-360).max(360).optional(),
  sunDiscEnabled: z.boolean().optional(),
  autoSunIntensityEnabled: z.boolean().optional(),
  autoSunColorEnabled: z.boolean().optional(),
  manualSunIntensity: z.number().min(0).max(10).optional(),
  manualSunColorHex: hexColorSchema.optional(),
  environmentRefreshEnabled: z.boolean().optional(),
  // Standalone "Sky" tab (webgl_shaders_sky.html parity) — ranges mirror
  // the reference demo's own GUI sliders exactly (turbidity 0-20,
  // rayleigh/mieDirectionalG 0-4/0-1, mieCoefficient 0-0.1). `skyEnabled`
  // is a Rozaris-specific addition, the demo has no off switch.
  skyEnabled: z.boolean().optional(),
  skyTurbidity: z.number().min(0).max(20).optional(),
  skyRayleigh: z.number().min(0).max(4).optional(),
  skyMieCoefficient: z.number().min(0).max(0.1).optional(),
  skyMieDirectionalG: z.number().min(0).max(1).optional(),
  // Experience Editor "Map" tab — places the project's own detailed model
  // on a real Mapbox map. See Project3DConfig's own doc comment. Null
  // lat/lng falls back to the project's `coords`, same convention as
  // MapModelVersion's placement fields (a separate, unrelated feature).
  mapViewEnabled: z.boolean().optional(),
  mapViewLatitude: z.number().min(-90).max(90).nullable().optional(),
  mapViewLongitude: z.number().min(-180).max(180).nullable().optional(),
  mapViewAltitude: z.number().min(-500).max(2000).optional(),
  mapViewHeadingDeg: z.number().min(-360).max(360).optional(),
  mapViewScale: z.number().positive().max(10).optional(),
  // The Mapbox camera itself, not the model's placement — Mapbox's own
  // hard limits (zoom 0-22, pitch 0-85°).
  mapViewZoom: z.number().min(0).max(22).optional(),
  mapViewPitchDeg: z.number().min(0).max(85).optional(),
  mapViewBearingDeg: z.number().min(-360).max(360).optional(),
  // "Map" tab — real-world site context as scene geometry (see
  // src/lib/types.ts `siteEnabled`). Ranges are deliberately permissive:
  // useProjectConfigEditor PATCHes the WHOLE draft on every save, so a
  // bound tighter than the UI can produce 400s the entire save and
  // silently loses unrelated edits (the documented Section widthM
  // 500->5000 precedent).
  siteEnabled: z.boolean().optional(),
  // Upper bound is a real rendering limit, not taste. It is NOT the sky
  // dome: SkyMesh renders BackSide with depthWrite:false, so it never
  // occludes geometry beyond it. The real constraint is the camera far
  // plane, which RenderEngine.applyCameraConfig now gives its own
  // site-aware floor. 2000 m (a 4 km square, ~2.8 km to the corners) is
  // where the near/far ratio starts costing real depth precision against
  // the 0.1 default near plane.
  siteRadiusM: z.number().min(100).max(2000).optional(),
  siteTerrainEnabled: z.boolean().optional(),
  siteImageryEnabled: z.boolean().optional(),
  siteImageryBrightness: z.number().min(0).max(2).optional(),
  siteOffsetX: z.number().min(-2000).max(2000).optional(),
  siteOffsetZ: z.number().min(-2000).max(2000).optional(),
  siteElevationOffset: z.number().min(-1000).max(1000).optional(),
  siteRotationDeg: z.number().min(-360).max(360).optional(),
  siteScale: z.number().positive().max(10).optional(),
  // 360° Backdrop Photo — real-photo site context composited under the
  // physical sky via a transparent-PNG sphere (RenderEngine.ts's
  // backdropMesh). `backdropImageUrl` is a Vercel Blob URL, uploaded via
  // /api/blob/upload's `panoramas/` pathname prefix, never taken as an
  // arbitrary external URL.
  backdropEnabled: z.boolean().optional(),
  backdropImageUrl: z.string().url().nullable().optional(),
  backdropRotationDeg: z.number().min(-360).max(360).optional(),
  backdropPitchDeg: z.number().min(-90).max(90).optional(),
  backdropElevation: z.number().min(-500).max(500).optional(),
  fogEnabled: z.boolean().optional(),
  fogColor: hexColorSchema.optional(),
  fogDensity: z.number().min(0).max(0.1).optional(),
  fogMatchesSky: z.boolean().optional(),
  // Experience Editor v2, Environment → Fog & Haze (PRD §12).
  fogHeightBandEnabled: z.boolean().optional(),
  fogHazeEnabled: z.boolean().optional(),
  fogNoiseEnabled: z.boolean().optional(),
  fogMovementEnabled: z.boolean().optional(),
  fogSunInteractionEnabled: z.boolean().optional(),
  fogBaseHeight: z.number().min(-500).max(2000).optional(),
  fogTopHeight: z.number().min(-500).max(2000).optional(),
  fogHaze: z.number().min(0).max(1).optional(),
  fogNoiseStrength: z.number().min(0).max(1).optional(),
  fogNoiseScale: z.number().min(0.0001).max(1).optional(),
  fogWindDirectionDeg: z.number().min(0).max(360).optional(),
  fogWindSpeed: z.number().min(0).max(2).optional(),
  fogFalloff: z.number().min(0.01).max(8).optional(),
  fogMaxOpacity: z.number().min(0).max(1).optional(),
  unitColorAvailable: hexColorSchema.optional(),
  unitColorReserved: hexColorSchema.optional(),
  unitColorSold: hexColorSchema.optional(),
  unitColorSelected: hexColorSchema.optional(),
  // Units Blocks & POI Layer PRD §5/§11-12/§24 — X-ray overlay appearance.
  unitBlocksEnabled: z.boolean().optional(),
  unitBlocksStatusColorsEnabled: z.boolean().optional(),
  unitBlocksXrayEnabled: z.boolean().optional(),
  unitBlocksDefaultOpacity: z.number().min(0).max(1).optional(),
  unitBlocksHoverOpacity: z.number().min(0).max(1).optional(),
  unitBlocksSelectedOpacity: z.number().min(0).max(1).optional(),
  unitBlocksSelectedOutlineEnabled: z.boolean().optional(),
  unitBlocksSelectedOutlineWidth: z.number().min(0.5).max(20).optional(),
  unitBlocksSelectedScaleEnabled: z.boolean().optional(),
  unitBlocksSelectedScale: z.number().min(1).max(1.5).optional(),
  unitBlocksSelectedFillEnabled: z.boolean().optional(),
  unitColorSelectedFill: hexColorSchema.optional(),
  unitBlocksSelectedXrayEnabled: z.boolean().optional(),
  // Units Blocks & POI Layer PRD §14 — master POI camera.
  unitPoiCameraEnabled: z.boolean().optional(),
  unitPoiCameraFov: z.number().min(10).max(120).optional(),
  unitPoiCameraDistanceMultiplier: z.number().min(0.5).max(20).optional(),
  unitPoiCameraHeightOffset: z.number().min(-20).max(20).optional(),
  unitPoiTransitionMs: z.number().min(0).max(10_000).optional(),
  unitPoiAutoOcclusionCorrection: z.boolean().optional(),
  // Unit-status caustics (webgpu_caustics.html parity, adapted).
  causticsEnabled: z.boolean().optional(),
  causticsScale: z.number().min(0.05).max(3).optional(),
  causticsSpeed: z.number().min(0).max(1).optional(),
  causticsIntensityAvailable: z.number().min(0).max(3).optional(),
  causticsIntensityReserved: z.number().min(0).max(3).optional(),
  causticsIntensitySold: z.number().min(0).max(3).optional(),
  shadowsEnabled: z.boolean().optional(),
  antialiasEnabled: z.boolean().optional(),
  sections: z.array(sectionSchema).optional(),
  // Sky/Water/Bloom/Clouds "Ocean" tab — ranges mirror
  // webgl_shaders_ocean.html's own GUI folders exactly (Bloom strength
  // 0-3/radius 0-1, Water distortionScale 0-8/size 0.1-10, Clouds
  // coverage/density/elevation 0-1 each). `bloomThreshold`/
  // `volumetricCloud*` removed entirely 2026-08-14 — see
  // Project3DConfig's own doc comment.
  bloomEnabled: z.boolean().optional(),
  bloomStrength: z.number().min(0).max(3).optional(),
  bloomRadius: z.number().min(0).max(1).optional(),
  waterEnabled: z.boolean().optional(),
  waterDistortionScale: z.number().min(0).max(8).optional(),
  waterSize: z.number().min(0.1).max(10).optional(),
  // Experience Editor v2, Environment → Water (PRD §13).
  waterType: z.enum(["sea", "lake", "pool", "decorative"]).optional(),
  waterWavesEnabled: z.boolean().optional(),
  waterMovementEnabled: z.boolean().optional(),
  waterSunReflectionEnabled: z.boolean().optional(),
  waterEnvReflectionEnabled: z.boolean().optional(),
  waterNormalMapEnabled: z.boolean().optional(),
  waterHeight: z.number().min(-500).max(500).optional(),
  waterColor: hexColorSchema.optional(),
  waterDeepColor: hexColorSchema.optional(),
  cloudsEnabled: z.boolean().optional(),
  cloudCoverage: z.number().min(0).max(1).optional(),
  cloudDensity: z.number().min(0).max(1).optional(),
  cloudElevation: z.number().min(0).max(1).optional(),
  // Experience Editor v2, Environment → Clouds (PRD §11).
  cloudMovementEnabled: z.boolean().optional(),
  cloudSunLightingEnabled: z.boolean().optional(),
  cloudShadowsEnabled: z.boolean().optional(),
  cloudHeight: z.number().min(0).max(2000).optional(),
  cloudThickness: z.number().min(1).max(1000).optional(),
  cloudThreshold: z.number().min(0).max(1).optional(),
  cloudOpacity: z.number().min(0).max(1).optional(),
  cloudSoftness: z.number().min(0.01).max(1).optional(),
  cloudScale: z.number().min(0.0001).max(1).optional(),
  cloudWindSpeed: z.number().min(0).max(2).optional(),
  cloudWindDirectionDeg: z.number().min(0).max(360).optional(),
  cloudRaymarchSteps: z.number().int().min(1).max(24).optional(),
  shadowSoftness: z.number().min(0).max(10).optional(),
  // 3D LUT (webgl_postprocessing_3dlut.html parity) — lutPreset is
  // validated against the real vendored preset list (all 9 of the
  // reference demo's own presets), not a free string.
  lutEnabled: z.boolean().optional(),
  lutPreset: z.enum(LUT_PRESET_IDS).optional(),
  lutIntensity: z.number().min(0).max(1).optional(),
  logarithmicDepthEnabled: z.boolean().optional(),
  loadingRevealEnabled: z.boolean().optional(),
  // Depth of field (webgl_postprocessing_dof2.html parity).
  depthOfFieldEnabled: z.boolean().optional(),
  depthOfFieldFocalLength: z.number().min(0.1).max(200).optional(),
  depthOfFieldBokehScale: z.number().min(0).max(5).optional(),
  // Distance Blur — depth-masked far-field blur, absolute metres.
  distanceBlurEnabled: z.boolean().optional(),
  distanceBlurStartM: z.number().min(0).max(5000).optional(),
  distanceBlurFullM: z.number().min(0).max(10000).optional(),
  distanceBlurAmount: z.number().min(0).max(1).optional(),
  distanceBlurRadius: z.number().min(0).max(8).optional(),
  // Experience Editor v2, Lighting tab (PRD §14-21).
  sunLightEnabled: z.boolean().optional(),
  sunTemperatureK: z.number().int().min(1000).max(40000).optional(),
  csmEnabled: z.boolean().optional(),
  csmCascades: z.number().int().min(1).max(4).optional(),
  csmMaxDistance: z.number().min(10).max(2000).optional(),
  csmResolution: z.number().int().min(256).max(4096).optional(),
  csmSplitMode: z.enum(["practical", "uniform", "logarithmic"]).optional(),
  csmMargin: z.number().min(0).max(1000).optional(),
  softShadowsEnabled: z.boolean().optional(),
  contactShadowsEnabled: z.boolean().optional(),
  contactShadowBlur: z.number().min(0).max(2).optional(),
  contactShadowDarkness: z.number().min(0).max(1).optional(),
  contactShadowOpacity: z.number().min(0).max(1).optional(),
  contactShadowRange: z.number().min(0.02).max(5).optional(),
  transmittedShadowsEnabled: z.boolean().optional(),
  coloredShadowsEnabled: z.boolean().optional(),
  transmittedShadowStrength: z.number().min(0).max(1).optional(),
  giEnabled: z.boolean().optional(),
  giIndirectEnabled: z.boolean().optional(),
  giAOEnabled: z.boolean().optional(),
  giBackfaceLighting: z.boolean().optional(),
  giTemporalFiltering: z.boolean().optional(),
  giScreenSpaceSampling: z.boolean().optional(),
  giIntensity: z.number().min(0).max(50).optional(),
  giAOIntensity: z.number().min(0).max(4).optional(),
  giRadius: z.number().min(0.5).max(50).optional(),
  giSliceCount: z.number().int().min(1).max(4).optional(),
  giStepCount: z.number().int().min(1).max(32).optional(),
  giExpFactor: z.number().min(0.5).max(6).optional(),
  giThickness: z.number().min(0.05).max(10).optional(),
  giLinearThickness: z.boolean().optional(),
  artificialLights: z.array(artificialLightSchema).max(64).optional(),
  volumetricLightingEnabled: z.boolean().optional(),
  sunShaftsEnabled: z.boolean().optional(),
  lightVolumesEnabled: z.boolean().optional(),
  volumetricRaymarchSteps: z.number().int().min(8).max(120).optional(),
  volumetricDensity: z.number().min(0).max(2).optional(),
  volumetricMaxDensity: z.number().min(0).max(2).optional(),
  volumetricDistanceAtten: z.number().min(0).max(10).optional(),
  // Experience Editor v2, Rendering tab (PRD §22-33) — Reflections (real
  // vendored SSRNode, single-bounce mirror+roughness-blur mode). Lens
  // Flare/Motion Blur are the other 2 genuinely new feature groups;
  // Anti-Aliasing/Bloom/DOF/Color reuse pre-existing fields above.
  ssrEnabled: z.boolean().optional(),
  ssrIntensity: z.number().min(0).max(3).optional(),
  ssrMaxDistance: z.number().min(1).max(200).optional(),
  ssrThickness: z.number().min(0.01).max(5).optional(),
  ssrQuality: z.number().min(0).max(1).optional(),
  lensFlareEnabled: z.boolean().optional(),
  lensFlareIntensity: z.number().min(0).max(3).optional(),
  motionBlurEnabled: z.boolean().optional(),
  motionBlurIntensity: z.number().min(0).max(2).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const config = await prisma.project3DConfig.findUnique({ where: { projectId } });
  return NextResponse.json(config);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.deletedAt) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }
  // Whole-row snapshot before the write — Project3DConfig is a 1:1
  // singleton (no version table of its own), so this row's audit history
  // IS its version history; restore-version PATCHes a past snapshot back.
  const previousConfig = await prisma.project3DConfig.findUnique({ where: { projectId } });

  // Cast needed for Prisma's Json input type on cameraPresets/viewerUI —
  // plain zod-inferred objects don't structurally satisfy
  // InputJsonObject's index signature without it (see the identical
  // comment on the sceneManifest/nodeOverrides writes in the
  // detail-models routes).
  const data = {
    ...parsed.data,
    cameraPresets: parsed.data.cameraPresets as unknown as Prisma.InputJsonValue,
    viewerUI: parsed.data.viewerUI as unknown as Prisma.InputJsonValue,
    sections: parsed.data.sections as unknown as Prisma.InputJsonValue,
    // Environment → Sun & Sky's solarAnchors (PRD §9) — same nullable-Json
    // cast pattern as the three above.
    solarAnchors: parsed.data.solarAnchors as unknown as Prisma.InputJsonValue,
    // Lighting → Artificial Lights (PRD §20) — same pattern.
    artificialLights: parsed.data.artificialLights as unknown as Prisma.InputJsonValue,
  };
  const updated = await prisma.project3DConfig.upsert({
    where: { projectId },
    update: data,
    create: { projectId, ...data },
  });

  // Config changes (lighting/camera/effects/environment) are embedded in
  // every version's ExperienceDocument snapshot too — refresh the latest
  // version's so it doesn't go stale relative to the config it was built
  // from. Best-effort: a project with no versions yet has nothing to
  // refresh, which refreshExperienceDocument already handles (no-op).
  const latestVersion = await prisma.detailModelVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  if (latestVersion) await refreshExperienceDocument(prisma, projectId, latestVersion.id);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "3D Experience config updated",
    entityType: "Project3DConfig",
    entityId: projectId,
    entityLabel: project.name,
    previousState: previousConfig,
    newState: updated,
  });

  return NextResponse.json(updated);
}
