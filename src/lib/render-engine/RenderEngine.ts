import * as THREE from "three/webgpu";
import mapboxgl from "mapbox-gl";
import { StudioBasemapLayer } from "./StudioBasemapLayer";
import type { BasemapAnchor } from "./basemapCameraSync";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// Environment tab (PRD §7-13) — SkyMesh/WaterMesh are the real TSL/
// NodeMaterial ports of webgl_shaders_sky.html/webgl_shaders_ocean.html's
// classic Sky/Water for this app's WebGPURenderer pipeline (vendored
// directly in three.js's own examples/jsm, not re-derived) — restored
// near-verbatim from the pre-rebuild engine's proven usage.
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import { WaterMesh } from "three/examples/jsm/objects/WaterMesh.js";
import { length as tslLength, mix as tslMix, positionWorld, smoothstep as tslSmoothstep, uniform } from "three/tsl";
import { buildCloudSystem, cloudShadowFactor, type CloudSystem } from "./clouds";
import { buildFogSystem, type FogSystem } from "./fog";
import { geographicSunPosition, sunColorForElevation, sunDirectionVector, sunPositionForAnchors } from "@/lib/sunPosition";
import { applyTransmittedShadows, buildCSMSystem, setShadowMapTransmitted, type CSMSystem } from "./shadows";
import { buildScenePostPipeline, computeScenePostSignature, type ScenePostPipeline } from "./postProcessing";
import { ensureLutLoading } from "./lut";
import { ArtificialLightSystem } from "./artificialLights";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { cleanGlbNodeName } from "@/lib/glbNodeName";
import {
  FOG_SKY_HORIZON_COLOR,
  GROUND_INFINITE_SIZE,
  QUALITY_TIERS,
  SKY_DOME_SCALE,
  WATER_PLANE_SIZE,
} from "@/lib/viewerPresets";
import { buildSectionCapGeometry, buildSectionPlanes, NO_ACTIVE_SECTION_PLANES, SECTION_INDICATOR_COLOR } from "./sections";
import {
  applyUnitBoxAppearance,
  applyUnitSelectionScale,
  buildUnitRegistry,
  clearUnitSelectionScale,
  disposeUnitBoxAppearanceCaches,
  findUnitRootObjects,
  type UnitRuntimeEntry,
  type UnitSelectionScaleOriginals,
} from "./unitRegistry";
import type { LineSegments2 } from "three/examples/jsm/lines/webgpu/LineSegments2.js";
import { IdleDroneController } from "./idleDroneCamera";
import type {
  CameraPreset,
  DetailModelSlotRole,
  EnvironmentConfig,
  LightingConfig,
  NodeOverride,
  Project3DConfig,
  ProjectDetailModel,
  RenderingConfig,
  Section,
  SceneManifestNode,
  Unit,
  UnitMeshLink,
  UnitsConfig,
} from "@/lib/types";

export const DEFAULT_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  solarControllerEnabled: false,
  solarPathMode: "manual",
  viewerTimeHours: 12,
  solarAnchors: [],
  geoLatitude: 41.3275,
  geoLongitude: 19.8187,
  simulationDate: "2025-01-01T00:00:00.000Z",
  northOffsetDeg: 0,
  sunDiscEnabled: true,
  autoSunIntensityEnabled: true,
  autoSunColorEnabled: true,
  manualSunIntensity: 1.2,
  manualSunColorHex: "#ffffff",
  environmentRefreshEnabled: true,
  sunAzimuthDeg: 180,
  sunElevationDeg: 45,
  skyEnabled: true,
  skyTurbidity: 4,
  skyRayleigh: 2.4,
  skyMieCoefficient: 0.004,
  skyMieDirectionalG: 0.78,
  backdropEnabled: false,
  backdropImageUrl: null,
  backdropRotationDeg: 0,
  backdropPitchDeg: 0,
  backdropElevation: 0,
  environmentIntensity: 1,
  cloudsEnabled: false,
  cloudCoverage: 0.4,
  cloudDensity: 0.5,
  cloudElevation: 0.5,
  cloudMovementEnabled: true,
  cloudSunLightingEnabled: true,
  cloudShadowsEnabled: false,
  cloudHeight: 220,
  cloudThickness: 50,
  cloudThreshold: 0.45,
  cloudOpacity: 0.85,
  cloudSoftness: 0.35,
  cloudScale: 0.01,
  cloudWindSpeed: 0.02,
  cloudWindDirectionDeg: 45,
  cloudRaymarchSteps: 16,
  fogEnabled: false,
  fogColor: "#c9d6e0",
  fogDensity: 0.015,
  fogMatchesSky: false,
  fogHeightBandEnabled: false,
  fogHazeEnabled: false,
  fogNoiseEnabled: false,
  fogMovementEnabled: true,
  fogSunInteractionEnabled: true,
  fogBaseHeight: 0,
  fogTopHeight: 40,
  fogHaze: 0.3,
  fogNoiseStrength: 0.3,
  fogNoiseScale: 0.05,
  fogWindDirectionDeg: 0,
  fogWindSpeed: 0.02,
  fogFalloff: 1,
  fogMaxOpacity: 0.85,
  waterEnabled: false,
  waterDistortionScale: 3.7,
  waterSize: 1,
  waterType: "decorative",
  waterWavesEnabled: true,
  waterMovementEnabled: true,
  waterSunReflectionEnabled: true,
  waterEnvReflectionEnabled: true,
  waterNormalMapEnabled: true,
  waterHeight: 0,
  waterColor: "#001e0f",
  waterDeepColor: "#00131f",
  groundEnabled: true,
  groundStyle: "disc",
  groundColor: "#d8d6e6",
  groundFogEnabled: false,
  groundFogRadius: 300,
};

function resolveFogColor(config: EnvironmentConfig): string {
  return config.fogMatchesSky ? FOG_SKY_HORIZON_COLOR : config.fogColor;
}

/** Rendering → Color's tone-mapping curve picker (PRD §31) — every real
 * THREE.*ToneMapping constant, keyed by Project3DConfig.toneMapping's own
 * string union. Plain renderer properties (this + toneMappingExposure),
 * not part of the TSL post-processing node graph — applied directly,
 * live, no pipeline rebuild needed. */
const TONE_MAPPING_MAP: Record<RenderingConfig["toneMapping"], THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

export const DEFAULT_LIGHTING_CONFIG: LightingConfig = {
  sunLightEnabled: true,
  sunTemperatureK: 5500,
  autoSunIntensityEnabled: true,
  autoSunColorEnabled: true,
  manualSunIntensity: 1.2,
  manualSunColorHex: "#ffffff",
  csmEnabled: false,
  csmCascades: 3,
  csmMaxDistance: 200,
  csmResolution: 2048,
  csmSplitMode: "practical",
  csmMargin: 100,
  softShadowsEnabled: true,
  shadowSoftness: 0,
  shadowsEnabled: true,
  contactShadowsEnabled: false,
  contactShadowBlur: 0.5,
  contactShadowDarkness: 0.6,
  contactShadowOpacity: 0.8,
  contactShadowRange: 0.3,
  transmittedShadowsEnabled: false,
  coloredShadowsEnabled: false,
  transmittedShadowStrength: 0.6,
  giEnabled: false,
  giIndirectEnabled: true,
  giAOEnabled: true,
  giBackfaceLighting: false,
  giTemporalFiltering: true,
  giScreenSpaceSampling: true,
  giIntensity: 10,
  giAOIntensity: 1,
  giRadius: 12,
  giSliceCount: 1,
  giStepCount: 12,
  giExpFactor: 2,
  giThickness: 1,
  giLinearThickness: false,
  artificialLights: [],
  volumetricLightingEnabled: false,
  sunShaftsEnabled: true,
  lightVolumesEnabled: false,
  volumetricRaymarchSteps: 60,
  volumetricDensity: 0.7,
  volumetricMaxDensity: 0.5,
  volumetricDistanceAtten: 2,
};

export const DEFAULT_RENDERING_CONFIG: RenderingConfig = {
  ssrEnabled: false,
  ssrIntensity: 1,
  ssrMaxDistance: 30,
  ssrThickness: 0.5,
  ssrQuality: 0.5,
  antialiasEnabled: true,
  bloomEnabled: false,
  bloomStrength: 1,
  bloomRadius: 0,
  lensFlareEnabled: false,
  lensFlareIntensity: 1,
  depthOfFieldEnabled: false,
  depthOfFieldFocalLength: 10,
  depthOfFieldBokehScale: 1,
  cameraAutoFocusEnabled: true,
  motionBlurEnabled: false,
  motionBlurIntensity: 1,
  exposure: 1,
  toneMapping: "aces",
  lutEnabled: false,
  lutPreset: "bourbon64",
  lutIntensity: 1,
};

/** Units tab (Units Blocks & POI Layer PRD) defaults — match the Prisma
 * column defaults exactly (see the migration's own doc comments), so an
 * unconfigured project renders identically to what every existing
 * project already showed via the old hardcoded UNIT_BOX_COLOR/
 * UNIT_BOX_OPACITY/SELECTED_COLOR constants in viewerPresets.ts. */
export const DEFAULT_UNITS_CONFIG: UnitsConfig = {
  unitColorAvailable: "#22c55e",
  unitColorReserved: "#eab308",
  unitColorSold: "#ef4444",
  unitColorSelected: "#6b55f5",
  unitBlocksEnabled: true,
  unitBlocksStatusColorsEnabled: true,
  unitBlocksXrayEnabled: true,
  unitBlocksDefaultOpacity: 0.18,
  unitBlocksHoverOpacity: 0.25,
  unitBlocksSelectedOpacity: 0.32,
  unitBlocksSelectedOutlineEnabled: true,
  unitBlocksSelectedOutlineWidth: 1,
  unitBlocksSelectedScaleEnabled: false,
  unitBlocksSelectedScale: 1.05,
  unitBlocksSelectedFillEnabled: false,
  unitColorSelectedFill: "#6b55f5",
  unitBlocksSelectedXrayEnabled: false,
  unitPoiCameraEnabled: true,
  unitPoiCameraFov: 38,
  unitPoiCameraDistanceMultiplier: 3,
  unitPoiCameraHeightOffset: 0.5,
  unitPoiTransitionMs: 900,
  unitPoiAutoOcclusionCorrection: false,
};

/** Performance tab (PRD §40) subset of Project3DConfig. */
export type QualityConfig = Pick<
  Project3DConfig,
  "renderingMode" | "qualityPreset" | "customRenderScale" | "customDprCap" | "adaptiveQualityEnabled" | "runtimeQualityReductionEnabled" | "interactionQualityReductionEnabled"
>;

const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  renderingMode: "auto",
  qualityPreset: "high_desktop",
  customRenderScale: null,
  customDprCap: null,
  adaptiveQualityEnabled: true,
  runtimeQualityReductionEnabled: true,
  interactionQualityReductionEnabled: true,
};

/** The real target renderScale/dprCap for a config — QUALITY_TIERS'
 * fixed per-preset values, except "custom" which reads the two admin-
 * entered overrides (falling back to the tier's own default when unset). */
function resolveQualityTarget(config: QualityConfig): { renderScale: number; dprCap: number } {
  const tier = QUALITY_TIERS[config.qualityPreset];
  if (config.qualityPreset === "custom") {
    return {
      renderScale: config.customRenderScale ?? tier.renderScale,
      dprCap: config.customDprCap ?? tier.dprCap,
    };
  }
  return { renderScale: tier.renderScale, dprCap: tier.dprCap };
}

const UNIT_NODE_PATTERN = /^Unit_/i;

/** The Camera-tab subset of Project3DConfig (PRD §37) — a Pick rather
 * than the full config, so RenderEngine doesn't need to know about
 * Environment/Lighting/Rendering fields it doesn't consume yet. */
export type CameraConfig = Pick<
  Project3DConfig,
  | "cameraFovDesktop"
  | "cameraFovMobile"
  | "cameraNearClip"
  | "cameraFarClip"
  | "cameraStartDistanceMultiplier"
  | "cameraMinDistanceMultiplier"
  | "cameraMaxDistanceMultiplier"
  | "cameraMinPolarDeg"
  | "cameraMaxPolarDeg"
  | "cameraMinAzimuthDeg"
  | "cameraMaxAzimuthDeg"
  | "cameraOrbitEnabled"
  | "cameraPanEnabled"
  | "cameraZoomEnabled"
  | "cameraDampingEnabled"
  | "autoRotate"
  // Idle Drone Camera PRD — folded into the same per-tab Pick/apply
  // pattern every other Camera-tab field already uses, rather than a new
  // sibling prop (see idleDroneCamera.ts's own doc comment).
  | "idleDroneEnabled"
  | "idleDroneDelaySec"
  | "idleDroneOrbitDurationSec"
  | "idleDroneClockwise"
  | "idleDroneMotionEnabled"
  | "idleDroneHeightEnabled"
  | "idleDroneHeightAmplitude"
  | "idleDroneDistanceEnabled"
  | "idleDroneDistanceAmplitude"
  | "idleDroneTargetEnabled"
  | "idleDroneTargetAmplitude"
  | "idleDroneVerticalCycles"
  | "idleDronePhaseOffsetDeg"
  | "idleDroneSmoothness"
>;

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  cameraFovDesktop: 50,
  cameraFovMobile: 60,
  cameraNearClip: 0.1,
  cameraFarClip: 2000,
  cameraStartDistanceMultiplier: 1.5,
  cameraMinDistanceMultiplier: 0.4,
  cameraMaxDistanceMultiplier: 2.5,
  cameraMinPolarDeg: 0,
  cameraMaxPolarDeg: 85,
  cameraMinAzimuthDeg: null,
  cameraMaxAzimuthDeg: null,
  cameraOrbitEnabled: true,
  cameraPanEnabled: true,
  cameraZoomEnabled: true,
  cameraDampingEnabled: true,
  autoRotate: false,
  idleDroneEnabled: true,
  idleDroneDelaySec: 60,
  idleDroneOrbitDurationSec: 80,
  idleDroneClockwise: true,
  idleDroneMotionEnabled: true,
  idleDroneHeightEnabled: true,
  idleDroneHeightAmplitude: 0.18,
  idleDroneDistanceEnabled: true,
  idleDroneDistanceAmplitude: 0.05,
  idleDroneTargetEnabled: true,
  idleDroneTargetAmplitude: 0.06,
  idleDroneVerticalCycles: 2,
  idleDronePhaseOffsetDeg: 0,
  idleDroneSmoothness: 0.88,
};

/**
 * ROZARIS 3D Experience Editor — Rendering & Authoring Architecture v2.0.
 *
 * Ground-up rebuild (2026-08-15) of the previous RenderEngine.ts. See the
 * "Rozaris 3D Experience Editor v2 rebuild" memory for the full decision
 * trail.
 *
 * Phase 0: GLB loading, camera/controls, one ambient + one directional
 * light, resize, screenshot, live perf telemetry.
 * Phase 1 (this pass): full Position/Rotation/Scale + Model switches
 * (Scene tab, PRD §5), non-destructive Materials node overrides (PRD §6).
 * Still NOT implemented: Sun&Sky/Clouds/Fog/Water (Phase 2), Shadows/GI/
 * Artificial/Volumetric Lighting (Phase 3), SSR/TRAA/Bloom/LensFlare/DOF/
 * MotionBlur/Color/LUT (Phase 4), Sections rework (Phase 5).
 *
 * One instance is shared across mount()/dispose() cycles.
 */

const MOBILE_VIEWPORT_BREAKPOINT = 768;

/** See the resize ResizeObserver's own doc comment (mount()) — throttles
 * real `renderer.setSize()` calls during a continuous container resize
 * (e.g. the Units panel's GSAP width tween) to avoid out-pacing the GPU's
 * ability to reallocate swap chain/render targets. */
const RESIZE_THROTTLE_MS = 90;

export interface RenderEngineCallbacks {
  onWebglFail: () => void;
  onPerfStats: (
    stats: {
      fps: number;
      frameTimeMs: number;
      drawCalls: number;
      triangles: number;
      textures: number;
      dpr: number;
    } | null
  ) => void;
  /** Units Blocks & POI Layer PRD §19-20 — the "3D → List" half of the
   * shared selection state: a real click on a unit block (not a drag-to-
   * orbit) fires this so the caller's own `selectedUnitId` React state —
   * the single source of truth per §20 — can follow, alongside whatever
   * else a click should do (scroll the list row into view, open the
   * detail panel). The engine ALSO updates its own internal selection
   * immediately for instant visual feedback, without waiting for the
   * caller to round-trip back through setSelectedUnit(). Optional — the
   * editor's own preview viewport doesn't need this wired. */
  onUnitClick?: (unitId: string | null) => void;
  /** Same shape, for hover — lets a caller show a cursor/tooltip without
   * polling the engine. Optional. */
  onUnitHover?: (unitId: string | null) => void;
}

export interface DetailModelEntry {
  slotId: string;
  model: ProjectDetailModel;
  /** Unit Mapping's "Status Preview" (PRD §5) — real project Units +
   * whether to tint Unit_<number> boxes by their linked status. Optional:
   * the public viewer doesn't pass units yet (Interaction-tab public
   * status display is later-phase scope), only the admin editor does. */
  units?: Unit[];
  statusPreviewEnabled?: boolean;
  /** Units Blocks & POI Layer PRD §2/§3 — which real slot this entry is
   * (building/units/surroundings/context/custom) and, if set, which
   * OTHER slot's transform to live-inherit instead of this entry's own
   * position/rotation/scale fields on `model`. Optional so a caller that hasn't
   * been updated yet (shouldn't exist post this PRD, but keeps the type
   * honest about what's really required) just gets "custom, no parent" —
   * the same as every pre-existing slot before this PRD's migration ran. */
  slotRole?: DetailModelSlotRole;
  transformParentSlotId?: string | null;
}

export interface MountParams {
  showPerfStats?: boolean;
  qualityConfig?: QualityConfig;
  /** "Mapbox merged into the Studio Scene" (approved plan, Phase 2) — when
   * set, this mount binds Studio's renderer to a live Mapbox basemap
   * sharing the same canvas instead of Three.js owning its own (see
   * `createBasemapRenderer`'s own doc comment). Mount-time only, like
   * `qualityConfig.renderingMode` — changing it needs a real remount. Not
   * yet threaded through from the editor UI (that's the plan's Phase 5);
   * this param exists so the engine itself is independently exercisable
   * (and was headed-verified) ahead of that wiring. */
  basemapAnchor?: BasemapAnchor | null;
}

function normalizeMaterials(m: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(m) ? m : [m];
}

/** Applies one NodeOverride's fields onto a fresh clone of a mesh's
 * original material, upgrading to MeshPhysicalMaterial first if any
 * Physical/Glass/Emissive-adjacent field needs it — same upgrade pattern
 * the pre-rebuild engine used (preserves the existing look instead of
 * setting a property that silently no-ops on MeshStandardMaterial). */
function buildOverriddenMaterial(original: THREE.Material, override: NodeOverride): THREE.Material {
  const std = original as THREE.MeshStandardMaterial;
  const needsPhysical =
    override.clearcoat != null ||
    override.clearcoatRoughness != null ||
    override.iridescence != null ||
    override.iridescenceIOR != null ||
    override.transmissionEnabled ||
    override.anisotropy != null ||
    override.sheen != null ||
    override.dispersion != null;

  let mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;
  if (needsPhysical) {
    mat =
      original instanceof THREE.MeshPhysicalMaterial
        ? (original.clone() as THREE.MeshPhysicalMaterial)
        : new THREE.MeshPhysicalMaterial({
            color: std.color?.clone(),
            map: std.map ?? null,
            normalMap: std.normalMap ?? null,
            roughnessMap: std.roughnessMap ?? null,
            metalnessMap: std.metalnessMap ?? null,
            aoMap: std.aoMap ?? null,
            emissiveMap: std.emissiveMap ?? null,
            emissive: std.emissive?.clone(),
            emissiveIntensity: std.emissiveIntensity,
            roughness: std.roughness,
            metalness: std.metalness,
            opacity: std.opacity,
            transparent: std.transparent,
            envMapIntensity: std.envMapIntensity,
          });
  } else {
    mat = std.clone();
  }

  // --- PBR base ---
  if (override.colorHex) mat.color?.set(override.colorHex);
  if (override.baseTextureEnabled === false) mat.map = null;
  if (override.roughness != null) mat.roughness = override.roughness;
  if (override.roughnessMapEnabled === false) mat.roughnessMap = null;
  if (override.metalness != null) mat.metalness = override.metalness;
  if (override.metalnessMapEnabled === false) mat.metalnessMap = null;
  if (override.opacity != null) {
    mat.opacity = override.opacity;
    mat.transparent = override.opacity < 1;
  }
  if (override.normalMapEnabled === false) mat.normalMap = null;
  if (override.normalStrength != null && mat.normalMap) {
    mat.normalScale = new THREE.Vector2(override.normalStrength, override.normalStrength);
  }
  if (override.aoMapEnabled === false) mat.aoMap = null;

  // --- Emissive ---
  if (override.emissiveEnabled) {
    if (override.emissiveColorHex) mat.emissive?.set(override.emissiveColorHex);
    if (override.emissiveIntensity != null) mat.emissiveIntensity = override.emissiveIntensity;
  } else if (override.emissiveEnabled === false) {
    mat.emissive?.set(0x000000);
    mat.emissiveIntensity = 0;
  }
  if (override.emissiveMapEnabled === false) mat.emissiveMap = null;

  // --- Physical-only fields (mat is MeshPhysicalMaterial when set) ---
  if (mat instanceof THREE.MeshPhysicalMaterial) {
    if (override.clearcoat != null) mat.clearcoat = override.clearcoat;
    if (override.clearcoatRoughness != null) mat.clearcoatRoughness = override.clearcoatRoughness;
    if (override.iridescence != null) mat.iridescence = override.iridescence;
    if (override.iridescenceIOR != null) mat.iridescenceIOR = override.iridescenceIOR;
    if (override.anisotropy != null) mat.anisotropy = override.anisotropy;
    if (override.anisotropyRotation != null) mat.anisotropyRotation = override.anisotropyRotation;
    if (override.sheen != null) mat.sheen = override.sheen;
    if (override.sheenColorHex) mat.sheenColor?.set(override.sheenColorHex);
    if (override.sheenRoughness != null) mat.sheenRoughness = override.sheenRoughness;
    if (override.dispersion != null) mat.dispersion = override.dispersion;
    if (override.transmissionEnabled) {
      mat.transmission = override.transmission ?? 1;
      if (override.ior != null) mat.ior = override.ior;
      if (override.thickness != null) mat.thickness = override.thickness;
      if (override.attenuationEnabled) {
        if (override.attenuationColorHex) mat.attenuationColor?.set(override.attenuationColorHex);
        if (override.attenuationDistance != null) mat.attenuationDistance = override.attenuationDistance;
      }
    }
  }

  // --- Texture transform (applies to every present map, shared UV) ---
  if (override.textureTransformEnabled) {
    const maps = [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.emissiveMap].filter(
      (t): t is THREE.Texture => !!t
    );
    maps.forEach((tex) => {
      if (override.mapScaleX != null || override.mapScaleY != null) {
        tex.repeat.set(override.mapScaleX ?? tex.repeat.x, override.mapScaleY ?? tex.repeat.y);
      }
      if (override.mapOffsetX != null || override.mapOffsetY != null) {
        tex.offset.set(override.mapOffsetX ?? tex.offset.x, override.mapOffsetY ?? tex.offset.y);
      }
      if (override.mapRotation != null) tex.rotation = (override.mapRotation * Math.PI) / 180;
      tex.needsUpdate = true;
    });
  }

  return mat;
}

export class RenderEngine {
  private callbacks: RenderEngineCallbacks;
  private mountToken = 0;

  private container: HTMLDivElement | null = null;
  private renderer: THREE.WebGPURenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  // "Real-world basemap" mount path (approved plan, Phase 2) — null on the
  // default (standard) mount. `map` non-null is this engine's own signal
  // for "basemap mode is active", read by performResize()/dispose() so
  // they don't fight Mapbox's ownership of the shared canvas.
  private map: mapboxgl.Map | null = null;
  private basemapLayer: StudioBasemapLayer | null = null;
  private basemapRafId: number | null = null;
  private ambient: THREE.AmbientLight | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** Throttle/trailing-call state for the resize observer below — see its own doc comment. */
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResizeAt = 0;

  // Sections module (PRD §34-36) — every "clippable" object (the loaded
  // GLB roots) lives inside clippingGroup instead of directly under
  // scene; sectionHelperGroup holds cap/indicator meshes, which must
  // NEVER themselves be clipped. Restored technique from the pre-rebuild
  // engine (real production bug fixes already baked into sections.ts —
  // see its own doc comments), not re-derived from scratch.
  private clippingGroup: THREE.ClippingGroup | null = null;
  private sectionHelperGroup: THREE.Group | null = null;
  private activeSectionId: string | null = null;
  private sectionFillClippingGroup: THREE.ClippingGroup | null = null;
  private sectionFillMaterial: THREE.MeshBasicMaterial | null = null;
  private sectionIndicatorMaterial: THREE.MeshBasicMaterial | null = null;
  private sectionIndicatorMesh: THREE.Mesh | null = null;
  private sectionFillMeshes: THREE.Mesh[] = [];
  private dracoLoader: DRACOLoader | null = null;
  private loader: GLTFLoader | null = null;
  private loadedRoots: THREE.Object3D[] = [];
  private modelRootsBySlot = new Map<string, THREE.Object3D>();
  /** The last entries passed to syncModels() — a Performance-tab-
   * triggered remount() (renderingMode change) needs to reload the same
   * content into the fresh scene afterward; without this, the real bug
   * this fixes is a blank viewport (Tris 1) after switching Rendering
   * Mode, since mount() only sets up the renderer/scene/camera, it never
   * loads any GLB on its own. */
  private lastSyncEntries: DetailModelEntry[] = [];
  private loadedGlbUrlBySlot = new Map<string, string>();
  private originalMaterials = new WeakMap<THREE.Mesh, THREE.Material[]>();
  /** Units Search Mode PRD, Phase 3 (2026-08-16) — the unit whose mesh
   * should render with the distinct SELECTED_COLOR/UNIT_BOX_SELECTED_
   * OPACITY treatment (both pre-existing constants in viewerPresets.ts,
   * never previously consumed by applyUnitBoxes). Independent of
   * `statusPreviewEnabled` — a visitor selecting a unit from the list
   * should see it highlighted even on a project that has that general
   * preview toggle off. */
  private selectedUnitId: string | null = null;
  /** Guards syncModels() calls that race a slower earlier one (e.g. two
   * quick Replace clicks) — each call gets its own token, a late-resolving
   * stale one's GLB load is discarded rather than raced into the scene. */
  private syncToken = 0;

  // Units Blocks & POI Layer PRD — real Unit Registry + X-ray overlay
  // (render-engine/unitRegistry.ts owns the actual traversal/material
  // logic; these are the caches/state that must survive across syncModels()
  // calls, same reasoning as originalMaterials above).
  private unitsConfig: UnitsConfig = DEFAULT_UNITS_CONFIG;
  private unitMaterialCache = new Map<string, THREE.MeshBasicMaterial>();
  private unitOutlineByMesh = new Map<THREE.Mesh, LineSegments2>();
  /** Authored transform of whichever unit root is currently scaled up by
   * the selection "pop" — restored, then re-applied, on every appearance
   * refresh (see refreshUnitRegistryAndAppearance). */
  private unitSelectionScaleOriginals: UnitSelectionScaleOriginals = new Map();
  /** unitId -> live runtime entry (bounds/meshes/root) — rebuilt after
   * every syncModels() and every refreshUnitStatuses() call, never on
   * every frame. */
  private unitRegistry = new Map<string, UnitRuntimeEntry>();
  private unitRaycastTargets: THREE.Mesh[] = [];
  private hoveredUnitId: string | null = null;
  private isolatedUnitId: string | null = null;
  private unitStatusFilters: { available: boolean; reserved: boolean; sold: boolean } = {
    available: true,
    reserved: true,
    sold: true,
  };
  /** Ids of the units that still pass the *non-status* half of the public
   * Units workspace's filter state (Surface/Rooms/Price/Floor/Building/
   * search) — `null` means "no such filter is active", which is not the
   * same as an empty set ("a filter is active and nothing matches", where
   * every block correctly hides). See `setUnitIdFilter`. */
  private unitIdFilter: Set<string> | null = null;
  private unitsModeEnabled = false;

  private showPerfStats = false;
  private perfSampleCounter = 0;
  private frameTimes: number[] = [];
  private lastFrameAt: number | null = null;

  // Performance tab (PRD §40).
  private qualityConfig: QualityConfig = DEFAULT_QUALITY_CONFIG;
  /** The renderScale actually in effect right now — starts at the
   * config's real target, only ever pushed DOWN by adaptive quality
   * (never up past the target without a config change/mount, matching
   * PRD §41's "temporarily reduce... when interaction stops, restore
   * full quality" for the interaction case, and a real sustained-low-fps
   * downgrade for the runtime case). */
  private effectiveRenderScale = 1;
  private downgradeStep = 0;
  private isInteracting = false;
  private interactionRenderScale: number | null = null;
  /** Kept fresh on mount + every resize (see performResize). Mobile gets
   * the admin-configured quality preset at full strength, same as
   * desktop — the interaction-time and sustained-low-fps render-scale
   * levers below both back off on mobile instead of firing, since a
   * touch-drag orbit is effectively constant contact (unlike an
   * occasional desktop mouse-drag), which made those two real, honest
   * "temporarily/adaptively reduce resolution" features read as "mobile
   * always looks low-res" in practice. `dprCap`/`renderScale` themselves
   * stay admin-controlled and untouched here. */
  private isMobileViewport = false;

  // Camera tab (PRD §37).
  private cameraConfig: CameraConfig = DEFAULT_CAMERA_CONFIG;
  private boundingRadius = 20;

  // Idle Drone Camera PRD — see idleDroneCamera.ts's own doc comment for
  // why this is a self-contained controller rather than more flat fields
  // here. `prefersReducedMotion` is read once at mount (§49);
  // `visibilityHandler` is only kept so dispose() can remove the exact
  // listener mount() added. `dronePathHelperGroup`/`showDronePath` are
  // the editor-only "Show Drone Path" helper (§38-39) — never built for
  // the public viewer since nothing there ever calls setShowDronePath().
  private idleDrone = new IdleDroneController();
  private prefersReducedMotion = false;
  private visibilityHandler: (() => void) | null = null;
  private dronePathHelperGroup: THREE.Group | null = null;
  private showDronePath = false;
  private droneRingLines: THREE.Line[] = [];
  private droneMarker: THREE.Mesh | null = null;

  // Environment tab (PRD §7-13) — see EnvironmentConfig's own doc comment.
  private environmentConfig: EnvironmentConfig = DEFAULT_ENVIRONMENT_CONFIG;
  private envScene: THREE.Scene | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRenderTarget: THREE.RenderTarget | null = null;
  private skyMesh: InstanceType<typeof SkyMesh> | null = null;
  /** 360° Backdrop Photo — a real Mesh (not the SkyMesh dome itself), see
   * this field group's own doc comment on EnvironmentConfig. Always
   * constructed in mount() like skyMesh/waterMesh/groundMesh, just
   * toggles `.visible`; its texture only reloads when `backdropImageUrl`
   * actually changes (backdropImageUrl tracks the URL the live `map`
   * texture was loaded from). */
  private backdropMesh: THREE.Mesh | null = null;
  private backdropImageUrl: string | null = null;
  private waterMesh: InstanceType<typeof WaterMesh> | null = null;
  private groundMesh: THREE.Mesh | null = null;
  private groundColorUniform: { value: THREE.Color } | null = null;
  private groundFogColorUniform: { value: THREE.Color } | null = null;
  private groundFogRadiusUniform: { value: number } | null = null;
  private groundFogStrengthUniform: { value: number } | null = null;
  private groundCloudShadowStrengthUniform: { value: number } | null = null;
  private groundCloudHeightUniform: { value: number } | null = null;
  private groundCloudScaleUniform: { value: number } | null = null;
  private groundCloudCoverageUniform: { value: number } | null = null;
  private groundCloudWindUniform: { value: THREE.Vector2 } | null = null;
  private groundSunDirectionUniform: { value: THREE.Vector3 } | null = null;
  private cloudSystem: CloudSystem | null = null;
  private fogSystem: FogSystem | null = null;
  /** The one real Global Sun Vector (PRD §10) — every Environment feature
   * (Sky/Water/Clouds/Fog/Ground today; Shadows/GI/Volumetrics/Lens Flare
   * in later phases) reads this SAME field, computed once per
   * setEnvironmentConfig() call, never independently. */
  private sunDirection = new THREE.Vector3(0, 1, 0);
  private sunDistance = 200;
  private environmentRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  /** environmentRefreshEnabled's "off" state (PRD §9) means the real PMREM
   * capture never re-runs after this first successful one — tracked so
   * scheduleEnvironmentRebuild can tell "haven't run yet" (still runs,
   * even if refresh is off — every project needs at least one real
   * environment map) from "already ran once, refresh is off, skip". */
  private hasRebuiltEnvironmentOnce = false;
  /** Real bug found live: the "freeze" gate below used to key purely off
   * `hasRebuiltEnvironmentOnce`, which the mount-time call already flips
   * true using DEFAULT_ENVIRONMENT_CONFIG's placeholder `skyEnabled: true`
   * — before the real per-project config has even been fetched. For any
   * project stored with `environmentRefreshEnabled: false` AND
   * `skyEnabled: false`, that meant the real config's rebuild got gated
   * out entirely: the cheap live path still flipped `skyMesh.visible =
   * false` (correct), but the expensive rebuild that would set
   * `scene.background` to the flat fallback color never ran again, so it
   * stayed permanently `null` from the placeholder's `skyEnabled: true`
   * pass — a solid black void wherever the (now-invisible) sky dome used
   * to be, with nothing else painted behind it. Tracking the `skyEnabled`
   * a rebuild actually captured lets the gate below force exactly one
   * more rebuild through when that flag changes, even with refresh off,
   * without touching the freeze's real intent (skip re-capturing PMREM
   * for continuous slider tweaks like turbidity/sun color while frozen). */
  private lastRebuiltSkyEnabled: boolean | null = null;

  // Lighting tab (PRD §14-21).
  private lightingConfig: LightingConfig = DEFAULT_LIGHTING_CONFIG;
  private csmSystem: CSMSystem | null = null;
  private artificialLightSystem: ArtificialLightSystem | null = null;

  // Rendering tab (PRD §22-33) — shares the Lighting tab's own post
  // pipeline (postProcessing.ts's buildScenePostPipeline), not a second
  // one; see scenePostPipeline's own doc comment below.
  private renderingConfig: RenderingConfig = DEFAULT_RENDERING_CONFIG;
  /** The ONE shared post-processing pipeline both Lighting (Contact
   * Shadows/GI/Sun Shafts) and Rendering (Reflections/Anti-Aliasing/
   * Bloom/Lens Flare/DOF/Motion Blur/LUT) extend — built/rebuilt from
   * BOTH configs together (postProcessing.ts's buildScenePostPipeline). */
  private scenePostPipeline: ScenePostPipeline | null = null;
  /** Which post-processing effects are structurally active right now —
   * the pipeline only gets a real rebuild when this changes (which
   * effects are on, and which MRT channels they need); numeric sliders
   * inside an already-active effect are cheap uniform updates instead
   * (postProcessing.ts's computeScenePostSignature/ScenePostPipeline.update). */
  private scenePostSignature: string | null = null;

  private hasFramedOnce = false;
  private contentBounds: { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3; size: THREE.Vector3 } | null = null;
  private cameraHelper: THREE.CameraHelper | null = null;
  private cameraTransition: {
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    startFov: number;
    endFov: number;
    startTime: number;
    durationMs: number;
  } | null = null;

  constructor(callbacks: RenderEngineCallbacks) {
    this.callbacks = callbacks;
  }

  async mount(container: HTMLDivElement, params: MountParams) {
    const token = ++this.mountToken;
    this.container = container;
    this.showPerfStats = params.showPerfStats ?? false;
    if (params.qualityConfig) this.qualityConfig = params.qualityConfig;
    const target = resolveQualityTarget(this.qualityConfig);
    this.effectiveRenderScale = target.renderScale;
    this.downgradeStep = 0;

    const renderer = await this.createRenderer(container, target, token, params.basemapAnchor ?? null);
    if (!renderer) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a20);
    this.scene = scene;

    // Sections module — see this.clippingGroup's own field doc comment.
    // Starts at the fixed 6-plane "nothing active" state always (see
    // NO_ACTIVE_SECTION_PLANES' own doc comment) — every later
    // activate/deactivate/switch reuses that same plane-count from here
    // on, never toggling the array's length.
    const clippingGroup = new THREE.ClippingGroup();
    clippingGroup.clippingPlanes = NO_ACTIVE_SECTION_PLANES;
    scene.add(clippingGroup);
    this.clippingGroup = clippingGroup;
    const sectionHelperGroup = new THREE.Group();
    sectionHelperGroup.name = "RZ_SectionHelpers";
    scene.add(sectionHelperGroup);
    this.sectionHelperGroup = sectionHelperGroup;

    // Idle Drone Camera PRD §38-39 — editor-only orbit-path helper, never
    // clipped (same reasoning as sectionHelperGroup above), empty until
    // setShowDronePath(true) actually populates it.
    const dronePathHelperGroup = new THREE.Group();
    dronePathHelperGroup.name = "RZ_DronePathHelper";
    scene.add(dronePathHelperGroup);
    this.dronePathHelperGroup = dronePathHelperGroup;

    this.isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
    const cfg = this.cameraConfig;
    const camera = new THREE.PerspectiveCamera(
      this.isMobileViewport ? cfg.cameraFovMobile : cfg.cameraFovDesktop,
      container.clientWidth / Math.max(1, container.clientHeight),
      cfg.cameraNearClip,
      cfg.cameraFarClip
    );
    camera.position.set(30, 24, 30);
    this.camera = camera;

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(60, 100, 40);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(sun, sun.target, ambient);
    this.sun = sun;
    this.ambient = ambient;

    // Lighting tab (PRD §14-21) — real shadow mapping, previously never
    // enabled at all in this rebuilt engine (renderer.shadowMap.enabled
    // defaults to false), so every mesh's real castShadow/receiveShadow
    // flags (already set correctly in syncModels) had nothing to actually
    // render. `shadowsEnabled` is the pre-existing master field this tab
    // finally gives a real home to.
    renderer.shadowMap.enabled = this.lightingConfig.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setShadowMapTransmitted(renderer, this.lightingConfig.transmittedShadowsEnabled);
    sun.castShadow = this.lightingConfig.shadowsEnabled;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = this.lightingConfig.shadowSoftness;

    const artificialLightSystem = new ArtificialLightSystem(scene);
    this.artificialLightSystem = artificialLightSystem;

    // Environment tab (PRD §7-13) — envScene/pmrem are the real shaded-
    // sky PMREM capture rig (rebuildEnvironment, restored near-verbatim
    // from the pre-rebuild engine); skyMesh/waterMesh/groundMesh are
    // always constructed (never conditionally, unlike the pre-rebuild
    // engine) and just toggle `.visible` — cheaper to manage than
    // constructing/disposing them on every on/off flip, and the ONE thing
    // that DOES need a real remount (renderingMode) already tears down
    // and rebuilds everything anyway.
    const envScene = new THREE.Scene();
    this.envScene = envScene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem = pmrem;

    const skyMesh = new SkyMesh();
    skyMesh.scale.setScalar(SKY_DOME_SCALE);
    scene.add(skyMesh);
    this.skyMesh = skyMesh;

    // 360° Backdrop Photo — a plain equirect-UV sphere just inside the
    // SkyMesh dome, unlit (MeshBasicMaterial, untouched by scene
    // lighting — it's a real photo, not a lit surface) and alpha-blended
    // (`transparent: true`) with `depthWrite: false` so it never fights
    // the sky/other transparent layers for the depth buffer, but
    // `depthTest: true` so real scene geometry (buildings) still
    // correctly occludes it. No renderOrder trick needed: SkyMesh itself
    // renders depthWrite:false in the opaque pass (see SkyMesh.js), so by
    // the time this transparent sphere draws, every pixel already holds
    // either real (depth-tested) building color or the sky's — alpha=1
    // photo pixels replace that; alpha=0 "sky hole" pixels blend through
    // at 0%, leaving the real sky exactly as rendered underneath. BackSide
    // matches skyMesh's own convention (camera sits inside both).
    // `toneMapped` left at its true default deliberately — the photo
    // shares the same tone-mapping curve/exposure as the physical sky it
    // borders, so an admin's exposure slider moves both together instead
    // of leaving a brightness seam at the horizon.
    const backdropMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const backdropMesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_SCALE * 0.9, 60, 40), backdropMaterial);
    backdropMesh.visible = false;
    // "YXZ" (yaw outer, pitch inner) so backdropPitchDeg's up/down tilt is
    // always relative to wherever backdropRotationDeg's left/right spin
    // has already turned the photo — the standard FPS-camera Euler order
    // for decoupling the two, not the Object3D default ("XYZ").
    backdropMesh.rotation.order = "YXZ";
    scene.add(backdropMesh);
    this.backdropMesh = backdropMesh;

    const waterNormals = new THREE.TextureLoader().load("/textures/waternormals.jpg", (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    });
    const waterMesh = new WaterMesh(new THREE.PlaneGeometry(WATER_PLANE_SIZE, WATER_PLANE_SIZE), {
      waterNormals,
      sunDirection: this.sunDirection.clone(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: this.environmentConfig.waterDistortionScale,
      size: this.environmentConfig.waterSize,
    });
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.visible = false;
    scene.add(waterMesh);
    this.waterMesh = waterMesh;

    const groundMaterial = this.buildGroundMaterial(this.environmentConfig);
    const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(this.boundingRadius * 1.6, 48), groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    groundMesh.visible = this.environmentConfig.groundEnabled;
    clippingGroup.add(groundMesh);
    this.groundMesh = groundMesh;

    const cloudSystem = buildCloudSystem();
    scene.add(cloudSystem.mesh);
    this.cloudSystem = cloudSystem;

    const fogSystem = buildFogSystem();
    scene.fogNode = fogSystem.node;
    this.fogSystem = fogSystem;


    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    this.controls = controls;
    // A user grabbing the view mid-transition wins immediately, rather
    // than fighting a saved-Shot transition for its remaining duration.
    // Also PRD §41's "Interaction Performance Strategy" — real, if scoped
    // to what exists now (render scale only; SSR/SSGI/volumetric/shadow
    // sample-count reduction all land with their own Phase 2-4 features).
    controls.addEventListener("start", () => {
      this.cameraTransition = null;
      // Idle Drone Camera PRD §17 — every real orbit/pan/zoom/touch/wheel
      // gesture is exactly this event; stops the drone immediately with
      // no animate-back (idleDrone.notifyInteraction's own doc comment).
      this.idleDrone.notifyInteraction(performance.now());
      this.isInteracting = true;
      if (this.qualityConfig.interactionQualityReductionEnabled && !this.isMobileViewport) {
        this.interactionRenderScale = Math.max(0.5, this.effectiveRenderScale * 0.7);
        this.applyRenderScale();
      }
    });
    controls.addEventListener("end", () => {
      this.isInteracting = false;
      this.interactionRenderScale = null;
      this.applyRenderScale();
    });

    // Units Blocks & POI Layer PRD §19 — real Raycaster support, scoped
    // to `unitRaycastTargets` only (never the whole architectural GLB —
    // both correct, since only confirmed-mapped units should be
    // clickable, and fast, since the target list never grows with the
    // building's own triangle/mesh count). Click-vs-drag distinguished by
    // pointer travel distance, not timing (timing is unreliable across
    // mouse/trackpad/touch) — the exact same class of gesture ambiguity
    // OrbitControls' own "start"/"end" events above already have to
    // account for. Both listeners no-op entirely while Units mode is off
    // (unitIdAtPointer's own early return), so this never interferes with
    // any other tool/gizmo interaction.
    const unitRaycaster = new THREE.Raycaster();
    const unitPointerNdc = new THREE.Vector2();
    let unitPointerDownAt: { x: number; y: number } | null = null;
    const UNIT_CLICK_DRAG_THRESHOLD_PX = 6;
    const unitIdAtPointer = (event: PointerEvent): string | null => {
      if (!this.unitsModeEnabled || this.unitRaycastTargets.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      unitPointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      unitPointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      unitRaycaster.setFromCamera(unitPointerNdc, camera);
      // Walks the hit list instead of taking `[0]`, and skips any unit
      // whose root is currently hidden. Both halves are load-bearing:
      // three.js' Raycaster filters on layers only, never on `.visible`
      // (r185, Raycaster.intersect), and `unitRaycastTargets` is rebuilt
      // only by refreshUnitRegistryAndAppearance() — the filter setters
      // (setUnitStatusFilters/setUnitIdFilter/isolateUnit) call
      // applyUnitVisibility() alone and leave the target list untouched.
      // Without this, a unit hidden by an Availability/Surface/Rooms
      // filter stayed clickable and opened a card for a block the visitor
      // could not see, and a hidden block in front swallowed the click
      // from a visible one behind it.
      for (const hit of unitRaycaster.intersectObjects(this.unitRaycastTargets, false)) {
        const hitUnitId = hit.object.userData.unitId as string | undefined;
        if (!hitUnitId) continue;
        if (this.unitRegistry.get(hitUnitId)?.rootObject.visible === false) continue;
        return hitUnitId;
      }
      return null;
    };
    renderer.domElement.addEventListener("pointermove", (event) => {
      const unitId = unitIdAtPointer(event);
      if (unitId === this.hoveredUnitId) return;
      this.hoveredUnitId = unitId;
      this.refreshUnitRegistryAndAppearance();
      this.callbacks.onUnitHover?.(unitId);
    });
    renderer.domElement.addEventListener("pointerdown", (event) => {
      unitPointerDownAt = { x: event.clientX, y: event.clientY };
    });
    renderer.domElement.addEventListener("pointerup", (event) => {
      const downAt = unitPointerDownAt;
      unitPointerDownAt = null;
      if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > UNIT_CLICK_DRAG_THRESHOLD_PX) return;
      if (!this.unitsModeEnabled) return;
      const unitId = unitIdAtPointer(event);
      this.selectedUnitId = unitId;
      this.refreshUnitRegistryAndAppearance();
      this.idleDrone.notifyInteraction(performance.now()); // Idle Drone Camera PRD §17 — a real unit click
      this.callbacks.onUnitClick?.(unitId);
    });

    // Idle Drone Camera PRD §49-50 — read the OS/browser reduced-motion
    // preference once (drone stays fully disabled for the life of this
    // mount if set, idleDroneCamera.ts's own step() doc comment) and pause
    // the idle clock/drone while the tab is hidden, resetting (not
    // resuming) on return so it never picks up mid-orbit after being away.
    this.prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const visibilityHandler = () => {
      if (!document.hidden) this.idleDrone.notifyInteraction(performance.now());
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    this.visibilityHandler = visibilityHandler;

    this.applyCameraConfig(this.cameraConfig);
    // Mount-time environment application stays direct/synchronous
    // (including its PMREM rebuild) — only the hot per-slider-tick path
    // (setEnvironmentConfig, called from React) debounces the rebuild.
    this.applyEnvironmentConfig(this.environmentConfig, true);
    this.applyLightingConfig(this.lightingConfig);
    this.applyRenderingConfig(this.renderingConfig);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    this.dracoLoader = dracoLoader;
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    this.loader = loader;

    // Front Page/Units Search Mode PRDs' live-resize choreography (a GSAP
    // width tween on a real DOM sibling, panel opening/closing) drives
    // this ResizeObserver continuously — real bug found live-testing that
    // transition: the canvas rendered solid black for roughly the first
    // half of the ~250ms transition every time, on both WebGPU and its
    // WebGL2 fallback. Coalescing to one real resize per rAF (~60fps)
    // made no measurable difference, which is itself informative — the
    // browser was already effectively coalescing ResizeObserver to about
    // that rate, so the actual problem isn't call *frequency* so much as
    // *volume*: ~15-20 real `renderer.setSize()` calls in quick
    // succession during one transition, each one presumably forcing the
    // WebGPU backend to reallocate its swap chain/render targets, adds up
    // to more reallocation work than the GPU can retire before the next
    // one lands — so the canvas never catches up until the resizing
    // itself slows down near the tween's ease-out tail.
    //
    // Throttled to one real resize per `RESIZE_THROTTLE_MS` instead, with
    // a guaranteed trailing call so the final settled size is never
    // skipped. Still reads as continuous/live to the eye (a threshold
    // well under normal human motion-smoothness perception) while
    // cutting the number of real GPU reallocations during a fast
    // transition by roughly 4-5x — confirmed empirically to remove the
    // black frame entirely.
    const resizeObserver = new ResizeObserver(() => {
      const now = performance.now();
      if (now - this.lastResizeAt >= RESIZE_THROTTLE_MS) {
        if (this.resizeTimer != null) {
          clearTimeout(this.resizeTimer);
          this.resizeTimer = null;
        }
        this.performResize(container, camera, renderer);
      } else if (this.resizeTimer == null) {
        this.resizeTimer = setTimeout(() => {
          this.resizeTimer = null;
          this.performResize(container, camera, renderer);
        }, RESIZE_THROTTLE_MS);
      }
    });
    resizeObserver.observe(container);
    this.resizeObserver = resizeObserver;

    // Real per-frame update+draw lives in renderFrame() (below) so it can
    // be driven from either this standalone loop (default mount,
    // unchanged behavior) or Mapbox's own custom-layer render callback
    // (basemap mount, via startBasemapRepaintLoop() instead — see
    // createBasemapRenderer's own doc comment for why Three.js must not
    // also own the frame loop there).
    if (!this.map) {
      renderer.setAnimationLoop(() => this.renderFrame());
    }
  }

  /**
   * The engine's real per-frame update+draw step (approved plan, Phase 2)
   * — extracted from what used to be `renderer.setAnimationLoop()`'s own
   * inline callback so it can be driven from either that same standalone
   * loop (default mount) or Mapbox's own custom-layer render callback (the
   * "real-world basemap" mount path). Identical logic either way — Studio's
   * OrbitControls camera stays authoritative in both, per the plan's
   * design decision.
   */
  private renderFrame() {
    const { renderer, camera, controls, scene } = this;
    if (!renderer || !camera || !controls || !scene) return;
    const now = performance.now();
    const last = this.lastFrameAt;
    this.lastFrameAt = now;
    const dtSeconds = last != null ? Math.min(0.25, (now - last) / 1000) : 0;
    if (last != null) {
      this.frameTimes.push(now - last);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
    }
    controls.update();
    this.stepCameraTransition(now);
    this.idleDrone.step(now, dtSeconds, camera, controls, {
      transitionInFlight: this.cameraTransition != null,
      prefersReducedMotion: this.prefersReducedMotion,
      tabHidden: document.hidden,
    });
    if (this.showDronePath) this.updateDronePathHelper();
    this.sampleAdaptiveQuality();
    this.stepEnvironmentAnimation(dtSeconds);
    // CSM's cascades track the live camera frustum — must be recomputed
    // every frame the camera can move (free orbit), per CSMShadowNode's
    // own doc comment ("call every time you change camera or settings").
    this.csmSystem?.updateFrustums();
    // Depth of Field real auto-focus (PRD §26) — the live camera-to-
    // orbit-target distance, recomputed every frame rather than a
    // manual distance that would drift out of sync as a visitor orbits.
    if (this.scenePostPipeline?.dofFocusDistance && this.renderingConfig.cameraAutoFocusEnabled) {
      this.scenePostPipeline.dofFocusDistance.value = camera.position.distanceTo(controls.target);
    }
    if (this.scenePostPipeline) this.scenePostPipeline.pipeline.render();
    else renderer.render(scene, camera);
    this.cameraHelper?.update();
    this.samplePerfStats();
  }

  /** See renderFrame()'s own call site — promoted from a mount()-local
   * closure to a method for the same reason renderFrame() itself was. */
  private samplePerfStats() {
    const renderer = this.renderer;
    if (!this.showPerfStats || !renderer) return;
    this.perfSampleCounter += 1;
    if (this.perfSampleCounter % 20 !== 0) return;
    const frames = this.frameTimes;
    const avgFrameMs = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
    this.callbacks.onPerfStats({
      fps: avgFrameMs > 0 ? Math.round(1000 / avgFrameMs) : 0,
      frameTimeMs: Math.round(avgFrameMs * 10) / 10,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      dpr: renderer.getPixelRatio(),
    });
  }

  /**
   * Constructs and initializes this mount's `WebGPURenderer` — branches
   * between the default path (Three.js owns its own canvas, byte-for-byte
   * the same construction this engine always did) and the "real-world
   * basemap" path (Mapbox owns the canvas/WebGL2 context instead; see
   * `createBasemapRenderer`'s own doc comment). Both branches already
   * report failure (`onWebglFail`) or handle a mount-token race
   * themselves — callers just bail on a `null` return.
   */
  private async createRenderer(
    container: HTMLDivElement,
    target: { renderScale: number; dprCap: number },
    mountToken: number,
    basemapAnchor: BasemapAnchor | null
  ): Promise<THREE.WebGPURenderer | null> {
    const renderer = basemapAnchor
      ? await this.createBasemapRenderer(container, mountToken)
      : await this.createStandardRenderer(mountToken);
    if (!renderer) return null;

    // Shared post-construction setup. Color grading applies identically
    // either way. Canvas *ownership* (DOM insertion, CSS style) does not —
    // Mapbox owns the canvas element itself in basemap mode. But BOTH
    // branches still need a real setPixelRatio()/setSize() call: verified
    // empirically (Phase 2 root-cause) that without it, Three's internal
    // render-target sizing — used by the post-processing pipeline's
    // offscreen scene-pass, active by default via TRAA — falls back to
    // some un-set internal default disconnected from the canvas's real
    // dimensions. Draw calls still get submitted (confirmed via
    // renderer.info), but nothing lands where it's visible: Studio's
    // scene silently fails to composite over Mapbox's basemap even though
    // the render loop runs error-free. So basemap mode still calls
    // setPixelRatio()/setSize() — just without touching DOM/CSS, and
    // without effectiveRenderScale's quality-tier downscale (unlike the
    // standard branch below): Mapbox and Three share the literal same
    // canvas/backing-buffer here, so shrinking it for Three's own
    // adaptive-quality would also blur Mapbox's own crisp basemap
    // rendering — reconciling basemap mode with the render-scale quality
    // tiers is a known follow-up, not solved by this Phase.
    const pixelRatio = Math.min(window.devicePixelRatio, target.dprCap);
    renderer.setPixelRatio(pixelRatio);
    if (basemapAnchor) {
      renderer.setSize(container.clientWidth, container.clientHeight, false);
    } else {
      renderer.setSize(container.clientWidth * this.effectiveRenderScale, container.clientHeight * this.effectiveRenderScale, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      container.appendChild(renderer.domElement);
    }
    // Real bug fix (pre-existing, Phase 2 of the original engine rebuild)
    // — the Environment tab's physically-based Sky/Water/Ground shaders
    // all produce genuine HDR output (a physical sky's luminance routinely
    // exceeds 1.0), and WebGPURenderer's own default is NoToneMapping
    // (hard-clip above 1.0) — without a real curve set before the first
    // PMREM sky capture below, the sky dome renders solid blown-out white
    // instead of a blue gradient. Reads from `this.renderingConfig` (real
    // Rendering → Color tab fields) rather than a hardcoded ACES/1 — by
    // the time this runs, React's setRenderingConfig has already updated
    // the field (same effect-ordering guarantee applyCameraConfig/
    // applyEnvironmentConfig already rely on), so this picks up the real
    // per-project value on first paint, not a default flash.
    renderer.toneMapping = TONE_MAPPING_MAP[this.renderingConfig.toneMapping];
    renderer.toneMappingExposure = this.renderingConfig.exposure;
    this.renderer = renderer;
    return renderer;
  }

  /** The default mount path — unchanged from before this method existed,
   * just extracted so createRenderer() can share its shared tail (above)
   * with createBasemapRenderer() below instead of duplicating it. */
  private async createStandardRenderer(mountToken: number): Promise<THREE.WebGPURenderer | null> {
    // renderingMode -> forceWebGL and antialiasEnabled -> antialias are
    // both renderer-CONSTRUCTION-time flags — "auto"/"webgpu" both let
    // Three.js probe for WebGPU and fall back to WebGL2 on its own; only
    // "webgl2" forces the WebGL2 backend outright. `antialias: false`
    // whenever Rendering → Anti-Aliasing (TRAA) is on, per TRAANode's own
    // doc note ("MSAA must be disabled when TRAA is in use") — real MSAA
    // otherwise, matching this engine's pre-Phase-4 always-on behavior.
    // Changing either after mount needs a real remount (see
    // setQualityConfig's/setRenderingConfig's own doc comments).
    const renderer = new THREE.WebGPURenderer({
      antialias: !this.renderingConfig.antialiasEnabled,
      forceWebGL: this.qualityConfig.renderingMode === "webgl2",
    });
    try {
      await renderer.init();
    } catch {
      if (mountToken === this.mountToken) this.callbacks.onWebglFail();
      return null;
    }
    if (mountToken !== this.mountToken) {
      renderer.dispose();
      return null;
    }
    return renderer;
  }

  /**
   * "Real-world basemap" mount path (approved plan, Phase 2) — creates a
   * non-interactive `mapboxgl.Map` in `container` (Studio's own
   * OrbitControls stays the sole navigation input, per the plan's design
   * decision: Mapbox never receives its own drag/scroll/rotate gestures
   * here) and binds a `THREE.WebGPURenderer`'s WebGL2 backend to that
   * map's own canvas+context via `StudioBasemapLayer`, exactly the
   * technique headed-verified by the plan's Phase 0 spike. Unlike the
   * standard path, this renderer's canvas is never appended/sized by
   * Three.js — Mapbox owns that canvas completely (dimensions,
   * devicePixelRatio, DOM lifecycle) — see performResize()'s and
   * dispose()'s own basemap branches for the other two places that
   * ownership split matters.
   *
   * Deliberately duplicates the Map tab's own style URL (`ProjectMapView.
   * tsx`) as a local literal rather than importing it — the plan's own
   * scope decision keeps this build fully independent of that untouched,
   * separately-owned feature.
   */
  private async createBasemapRenderer(container: HTMLDivElement, mountToken: number): Promise<THREE.WebGPURenderer | null> {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!accessToken) {
      if (mountToken === this.mountToken) this.callbacks.onWebglFail();
      return null;
    }
    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/armalindokapaj/cmsqj4p0101ao01sd6911ckb4",
      center: [0, 0],
      zoom: 2,
      interactive: false,
      attributionControl: false,
    });

    const renderer = await new Promise<THREE.WebGPURenderer | null>((resolve) => {
      const layer = new StudioBasemapLayer({
        onRendererReady: (r) => resolve(r),
        onRendererFailed: () => resolve(null),
        onFrame: () => this.renderFrame(),
      });
      this.basemapLayer = layer;
      map.on("load", () => map.addLayer(layer));
    });

    if (!renderer || mountToken !== this.mountToken) {
      map.remove();
      this.basemapLayer = null;
      renderer?.dispose();
      if (mountToken === this.mountToken && !renderer) this.callbacks.onWebglFail();
      return null;
    }

    this.map = map;
    this.startBasemapRepaintLoop();
    return renderer;
  }

  /**
   * Mapbox only calls a custom layer's `render()` when IT decides a
   * repaint is needed (camera move, style change) — Studio's own scene has
   * continuous animation (water, clouds, idle drone, in-flight camera
   * transitions, TRAA accumulation) that needs a steady repaint regardless.
   * Calling `triggerRepaint()` from an INDEPENDENT rAF loop — never from
   * inside `render()` itself, which would infinitely self-schedule, the
   * exact anti-pattern `ProjectModelLayer.render()`'s own doc comment
   * already warns against — is Mapbox's own supported pattern for an
   * animated custom layer.
   */
  private startBasemapRepaintLoop() {
    const tick = () => {
      this.map?.triggerRepaint();
      this.basemapRafId = requestAnimationFrame(tick);
    };
    this.basemapRafId = requestAnimationFrame(tick);
  }

  /** Environment tab (PRD §7-13) — cheap, every-frame CPU-side uniform
   * writes: advances Fog/Cloud wind offsets (only when their own Movement
   * toggle is on — a genuinely pausable animation, not just a shader
   * `time` term nothing can stop) and re-centers the cloud layer on the
   * camera. Uses the CACHED `this.environmentConfig`/`this.sunDirection`
   * from the last real `applyEnvironmentConfig` call — recomputing the
   * Global Sun Vector itself every frame would be wasted work since it
   * only ever changes when React calls setEnvironmentConfig(). */
  private stepEnvironmentAnimation(dtSeconds: number) {
    const { camera, fogSystem, cloudSystem, environmentConfig } = this;
    if (!camera) return;
    fogSystem?.update(environmentConfig, this.sunDirection, dtSeconds);
    cloudSystem?.update(environmentConfig, this.sunDirection, camera.position, dtSeconds);
  }

  /** Shots (PRD §38) — steps an in-flight flyToPreset() transition. Runs
   * every frame after controls.update() so it's the authoritative final
   * camera write for the frame, same ordering the pre-rebuild engine used
   * (otherwise OrbitControls silently fights/overwrites it mid-flight). */
  private stepCameraTransition(now: number) {
    const t = this.cameraTransition;
    const { camera, controls } = this;
    if (!t || !camera || !controls) return;
    const elapsed = now - t.startTime;
    const p = Math.min(1, elapsed / Math.max(1, t.durationMs));
    const eased = p * p * (3 - 2 * p); // smoothstep
    camera.position.lerpVectors(t.startPos, t.endPos, eased);
    controls.target.lerpVectors(t.startTarget, t.endTarget, eased);
    camera.fov = t.startFov + (t.endFov - t.startFov) * eased;
    camera.updateProjectionMatrix();
    if (p >= 1) this.cameraTransition = null;
  }

  /** Adds/updates/removes per-slot content to match `entries` — the ONE
   * entry point every editing surface (Scene tab transform/switches,
   * Materials tab overrides, Unit Mapping's status preview) calls after
   * mount(). Critical distinction from a naive "just re-mount everything"
   * approach: a slot whose glbUrl hasn't changed gets a CHEAP in-place
   * update (transform/switches/overrides/unit-boxes reapplied to the
   * already-loaded root, no network request) — this is what makes every
   * slider/toggle in the Inspector responsive instead of reloading the
   * GLB on every drag tick (the exact "needs triple-clicking" class of
   * bug a prior pass on this codebase had to fix once already). Only a
   * genuinely new/changed glbUrl, or a slot appearing/disappearing,
   * touches the network or the scene graph's set of loaded roots. */
  async syncModels(entries: DetailModelEntry[]) {
    this.lastSyncEntries = entries;
    const scene = this.scene;
    const loader = this.loader;
    const clippingGroup = this.clippingGroup;
    if (!scene || !loader || !clippingGroup) return;
    const token = ++this.syncToken;

    const wantedSlotIds = new Set(entries.filter((e) => e.model.enabled !== false).map((e) => e.slotId));
    for (const [slotId, root] of this.modelRootsBySlot) {
      if (!wantedSlotIds.has(slotId)) {
        clippingGroup.remove(root);
        this.modelRootsBySlot.delete(slotId);
        this.loadedGlbUrlBySlot.delete(slotId);
      }
    }

    let loadedSomethingNew = false;
    for (const { slotId, model } of entries) {
      if (model.enabled === false) continue;
      const existingRoot = this.modelRootsBySlot.get(slotId);
      const existingUrl = this.loadedGlbUrlBySlot.get(slotId);

      if (existingRoot && existingUrl === model.glbUrl) {
        // Cheap path — same GLB, just re-apply state.
        this.applyTransform(existingRoot, model);
        existingRoot.visible = model.visible !== false;
        existingRoot.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = model.castShadow !== false;
          mesh.receiveShadow = model.receiveShadow !== false;
        });
        this.applyNodeOverrides(existingRoot, model);
        applyTransmittedShadows(existingRoot, this.lightingConfig);
        continue;
      }

      // New slot, or its GLB changed (Replace) — real (re)load.
      try {
        const gltf = await loader.loadAsync(model.glbUrl);
        if (token !== this.syncToken) return; // superseded by a newer syncModels() call
        if (existingRoot) clippingGroup.remove(existingRoot);
        const root = gltf.scene;
        this.applyTransform(root, model);
        root.visible = model.visible !== false;
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = model.castShadow !== false;
          mesh.receiveShadow = model.receiveShadow !== false;
        });
        this.applyNodeOverrides(root, model);
        applyTransmittedShadows(root, this.lightingConfig);
        clippingGroup.add(root);
        this.modelRootsBySlot.set(slotId, root);
        this.loadedGlbUrlBySlot.set(slotId, model.glbUrl);
        loadedSomethingNew = true;
      } catch (err) {
        console.error("RenderEngine: GLB load failed", model.glbUrl, err);
      }
    }

    if (token !== this.syncToken) return;

    // Units Blocks & POI Layer PRD §3 — "Units GLB must inherit Building
    // transform." Runs AFTER every root's own transform is applied above,
    // so a child slot always copies its parent's freshly-updated
    // position/rotation/scale — including on an admin's live Building
    // transform drag, since that already re-enters this same syncModels()
    // cheap path every tick. Deliberately overrides ANY of the child
    // slot's own transform fields rather than blending them — per PRD §3
    // the Units slot's own transform is meant to be ignored entirely.
    for (const entry of entries) {
      const parentSlotId = entry.transformParentSlotId;
      if (!parentSlotId) continue;
      const childRoot = this.modelRootsBySlot.get(entry.slotId);
      const parentRoot = this.modelRootsBySlot.get(parentSlotId);
      if (!childRoot || !parentRoot) continue;
      childRoot.position.copy(parentRoot.position);
      childRoot.rotation.copy(parentRoot.rotation);
      childRoot.scale.copy(parentRoot.scale);
    }

    this.loadedRoots = Array.from(this.modelRootsBySlot.values());
    this.refreshUnitRegistryAndAppearance();
    // Only reframe the camera when something NEW came in — an in-place
    // transform/material edit on already-loaded content must never yank
    // the camera away from wherever the admin currently has it pointed.
    if (loadedSomethingNew) this.frameLoadedContent();
  }

  /** Units Blocks & POI Layer PRD §10-12 — rebuilds the unit registry
   * (bounds/meshes/status) and re-applies the X-ray overlay material
   * across EVERY currently-loaded slot's root, merged into one project-
   * wide `unitRegistry`/`unitRaycastTargets` (a unit's mesh could in
   * principle live in the Building GLB — the old embedded-Unit_-boxes
   * pattern — or a dedicated `role: units` slot; this doesn't care
   * which). Called after syncModels() (new/changed content or transform
   * inheritance), and again by setSelectedUnit/hoverUnit/
   * refreshUnitStatuses/setUnitsMode/etc. below — cheap (bounding-box
   * math + a materialCache-backed material assignment, no GLB reload,
   * no allocation on the hot hover-in/hover-out path once the cache is
   * warm). */
  private refreshUnitRegistryAndAppearance() {
    // Un-pop the previously selected unit first, so every bounding box
    // measured below is the authored one.
    clearUnitSelectionScale(this.unitSelectionScaleOriginals);
    const rootObjectsByName = new Map<string, THREE.Object3D>();
    const allLinks: UnitMeshLink[] = [];
    const unitsById = new Map<string, Unit>();
    const poiByUnitId = new Map<
      string,
      { poiYawDeg: number; poiEnabled: boolean; poiDistanceOverride: number | null; poiHeightOverride: number | null }
    >();
    let anyStatusPreviewEnabled = false;

    for (const { slotId, model, units, statusPreviewEnabled } of this.lastSyncEntries) {
      const root = this.modelRootsBySlot.get(slotId);
      if (!root || model.enabled === false) continue;
      for (const [name, obj] of findUnitRootObjects(root)) rootObjectsByName.set(name, obj);
      for (const link of model.unitLinks) {
        allLinks.push(link);
        poiByUnitId.set(link.unitId, {
          poiYawDeg: link.poiYawDeg ?? 0,
          poiEnabled: link.poiEnabled ?? true,
          poiDistanceOverride: link.poiDistanceOverride ?? null,
          poiHeightOverride: link.poiHeightOverride ?? null,
        });
      }
      for (const u of units ?? []) unitsById.set(u.id, u);
      if (statusPreviewEnabled ?? true) anyStatusPreviewEnabled = true;
    }

    this.unitRaycastTargets = applyUnitBoxAppearance(
      rootObjectsByName,
      allLinks,
      unitsById,
      anyStatusPreviewEnabled,
      this.selectedUnitId,
      this.hoveredUnitId,
      this.unitsConfig,
      this.originalMaterials,
      this.unitMaterialCache,
      this.unitOutlineByMesh
    );
    this.unitRegistry = buildUnitRegistry(rootObjectsByName, allLinks, unitsById, poiByUnitId);

    // Selection "pop" — last, on top of a registry built from un-scaled
    // bounds, so focusUnit()'s framing keeps using the unit's real size.
    if (this.unitsConfig.unitBlocksEnabled && this.unitsConfig.unitBlocksSelectedScaleEnabled && this.selectedUnitId) {
      const selected = this.unitRegistry.get(this.selectedUnitId);
      if (selected) {
        applyUnitSelectionScale(
          selected.rootObject,
          this.unitsConfig.unitBlocksSelectedScale,
          this.unitSelectionScaleOriginals
        );
      }
    }
    this.applyUnitVisibility();
  }

  /** Units mode (§13) + status filters (§18) + isolate (§18) — all pure
   * visibility toggles on already-built registry entries, no material
   * work, no registry rebuild. Runs after refreshUnitRegistryAndAppearance
   * and again whenever any of the three inputs change on their own. */
  private applyUnitVisibility() {
    for (const entry of this.unitRegistry.values()) {
      const passesFilter = this.unitStatusFilters[entry.status];
      const passesIdFilter = this.unitIdFilter == null || this.unitIdFilter.has(entry.unitId);
      const passesIsolate = this.isolatedUnitId == null || this.isolatedUnitId === entry.unitId;
      entry.rootObject.visible = this.unitsModeEnabled && passesFilter && passesIdFilter && passesIsolate;
    }
  }

  /** §18 — master Units-mode toggle (Explore/Views/Time hide unit blocks;
   * the Units workspace shows them, per §13). */
  setUnitsMode(enabled: boolean) {
    this.unitsModeEnabled = enabled;
    this.applyUnitVisibility();
  }

  /** §18/§13 — per-status show/hide within Units mode. */
  setUnitStatusFilters(filters: { available: boolean; reserved: boolean; sold: boolean }) {
    this.unitStatusFilters = filters;
    this.applyUnitVisibility();
  }

  /** The rest of the public Units workspace's filter state (Surface,
   * Rooms, Price, Floor, Building, the search box) projected onto the same
   * one visibility pass `setUnitStatusFilters` already drives — pass the
   * ids that currently match, or `null` when none of those fields is
   * narrowing anything.
   *
   * Added 2026-08-24 (direct instruction: "the Surface Filtering its not
   * working"). Status was the only filter field wired to the 3D scene, so
   * changing Availability visibly hid blocks while dragging Surface — or
   * picking a bedroom count, or a price range — changed nothing on screen
   * at all unless the Filter List side panel happened to be open to show
   * its own count dropping. The filtering itself was real the whole time
   * (`filterUnits` genuinely narrowed the list); what was missing was this
   * half of it ever reaching the model. Deliberately id-based rather than
   * a second copy of the filter predicate down here: `filterUnits` in
   * `unitFilters.ts` stays the single definition of what "matches", the
   * same one the list and the dock's own count badge read.
   *
   * Kept separate from `setUnitStatusFilters` rather than folded into it
   * — that one is PRD §18's own tri-state toggle API, also used by the
   * admin editor, and it has no notion of a project's live unit rows. */
  setUnitIdFilter(unitIds: string[] | null) {
    this.unitIdFilter = unitIds == null ? null : new Set(unitIds);
    this.applyUnitVisibility();
  }

  /** §18 — hides every unit block except the given one; null clears it. */
  isolateUnit(unitId: string | null) {
    this.isolatedUnitId = unitId;
    this.applyUnitVisibility();
  }

  /** §18 — hover highlight (independent of selection). */
  hoverUnit(unitId: string | null) {
    if (this.hoveredUnitId === unitId) return;
    this.hoveredUnitId = unitId;
    this.refreshUnitRegistryAndAppearance();
  }

  /** §21-22 — live status sync with ZERO GLB reload/remapping. Updates
   * each cached sync entry's own `units` array in place (so a later
   * syncModels() call — e.g. the next unrelated Inspector edit — doesn't
   * clobber it back to stale data) and re-applies box appearance/registry
   * immediately. The one function `useProjectUnits`'s polling (on load,
   * window focus, visibilitychange, and every ~30s) should call. */
  refreshUnitStatuses(units: Unit[]) {
    this.lastSyncEntries = this.lastSyncEntries.map((entry) => ({ ...entry, units }));
    this.refreshUnitRegistryAndAppearance();
  }

  /** Units tab (PRD §14, §24) — project-level appearance/POI-camera
   * config, applied live (no remount), same pattern as
   * setEnvironmentConfig/setLightingConfig/setRenderingConfig. */
  setUnitsConfig(config: UnitsConfig) {
    this.unitsConfig = config;
    this.refreshUnitRegistryAndAppearance();
  }

  /** Position/Rotation/Scale — PRD §5. Y axis reuses the pre-existing
   * altitudeOffset/rotationDeg field names (see ProjectDetailModel's own
   * doc comment); X/Z are the Phase 1 addition. */
  private applyTransform(root: THREE.Object3D, model: ProjectDetailModel) {
    root.scale.setScalar(model.scale);
    root.rotation.set(
      (model.rotationXDeg * Math.PI) / 180,
      (model.rotationDeg * Math.PI) / 180,
      (model.rotationZDeg * Math.PI) / 180
    );
    root.position.set(model.positionX, model.altitudeOffset, model.positionZ);
  }

  /** Non-destructive Materials overrides (PRD §6) — every mesh's ORIGINAL
   * material is cached the first time it's seen and never mutated; every
   * (re)application clones fresh from that cached original, so toggling
   * an override off (or "Restore Original") always gets back exactly
   * what the GLB shipped with, never a drifted copy of a copy. */
  private applyNodeOverrides(root: THREE.Object3D, model: ProjectDetailModel) {
    const overrides = model.nodeOverrides ?? [];
    const manifest = model.sceneManifest ?? [];
    const rzToOverride = new Map(overrides.map((o) => [o.rzNodeId, o]));
    const nameToOverride = new Map<string, NodeOverride>(
      manifest.flatMap((n: SceneManifestNode) => {
        const o = rzToOverride.get(n.rzNodeId);
        return o ? [[n.name, o] as const] : [];
      })
    );

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Cleaned the same way `sceneManifest`'s names are (glbNodeName.ts) —
      // `nameToOverride` is keyed off those cleaned names, so the live
      // lookup below has to match on the same string or every node behind
      // a stripped prefix (e.g. a Blender "Layer:" export) would silently
      // never find its override.
      const name = cleanGlbNodeName(mesh.name);
      // Unit_<number> boxes get their own dedicated status-color tinting
      // (applyUnitBoxes) — Materials-tab overrides don't apply to them,
      // same exclusion the pre-rebuild engine had.
      if (UNIT_NODE_PATTERN.test(name)) return;
      if (!this.originalMaterials.has(mesh)) {
        this.originalMaterials.set(mesh, normalizeMaterials(mesh.material));
      }
      const originals = this.originalMaterials.get(mesh)!;
      const override = nameToOverride.get(name);

      const currentIsOriginal = normalizeMaterials(mesh.material).every((m, i) => m === originals[i]);

      if (!override || override.materialOverrideEnabled === false) {
        if (!currentIsOriginal) {
          normalizeMaterials(mesh.material).forEach((m) => m.dispose());
          mesh.material = originals.length === 1 ? originals[0] : originals;
        }
        if (override?.visible === false) mesh.visible = false;
        return;
      }

      if (!currentIsOriginal) normalizeMaterials(mesh.material).forEach((m) => m.dispose());
      const built = originals.map((orig) => buildOverriddenMaterial(orig, override));
      mesh.material = built.length === 1 ? built[0] : built;
      if (override.visible === false) mesh.visible = false;
    });
  }

  /** Units Search Mode PRD, Phase 3 / Units Blocks & POI Layer PRD §18-20 —
   * real list→3D sync's "select" half: re-applies unit-box appearance
   * across every currently-loaded root (via the cached `lastSyncEntries`/
   * `modelRootsBySlot`, no GLB reload) so selecting a unit — from the list
   * OR from a real 3D click (see the pointerup handler in mount()) — keeps
   * both directions of §20's single `selectedUnitId` state in sync. A
   * project whose GLB has no real `Unit_*`-named meshes for this unit
   * simply shows no visible change — same honest no-op the old
   * implementation already had for an unmapped unit. */
  setSelectedUnit(unitId: string | null) {
    this.selectedUnitId = unitId;
    this.refreshUnitRegistryAndAppearance();
  }

  /** Units Blocks & POI Layer PRD §16-17 — "Camera calculation." Frames
   * the given unit using the ONE master POI camera config
   * (unitPoiCamera*) plus this unit's own `poiYawDeg` (interpreted in
   * Building-local space — i.e. relative to the unit ROOT's own world
   * position/orientation, which already reflects any Building rotation
   * via transform inheritance/the unit's own placement in that hierarchy,
   * so a later Building rotation automatically keeps every unit's camera
   * correct with no extra math here). Reuses the exact same
   * cameraTransition/stepCameraTransition machinery flyToPreset() already
   * built (PRD §17 — "do not introduce another animation library"), not a
   * second transition system. No-op (returns false) if the unit isn't in
   * the registry (not yet loaded, or genuinely unmapped) or has
   * poiEnabled === false. */
  focusUnit(unitId: string): boolean {
    const entry = this.unitRegistry.get(unitId);
    const camera = this.camera;
    const controls = this.controls;
    if (!entry || !camera || !controls || !entry.poiEnabled || !this.unitsConfig.unitPoiCameraEnabled) return false;
    this.idleDrone.notifyInteraction(performance.now()); // Idle Drone Camera PRD §18/§42 — POI focus always preempts the drone

    const distance = entry.poiDistanceOverride ?? entry.worldBoundingSphere.radius * this.unitsConfig.unitPoiCameraDistanceMultiplier;
    const height = entry.poiHeightOverride ?? this.unitsConfig.unitPoiCameraHeightOffset;
    const yawRad = (entry.poiYawDeg * Math.PI) / 180;
    // Offset rotated by the unit's own authored yaw, matching §16's
    // diagram exactly: bounding-sphere center -> rotate a flat offset by
    // poiYawDeg -> add the height lift.
    const offset = new THREE.Vector3(Math.sin(yawRad) * distance, height, Math.cos(yawRad) * distance);
    const endPos = entry.worldCenter.clone().add(offset);
    const endTarget = entry.worldCenter.clone();

    this.cameraTransition = {
      startPos: camera.position.clone(),
      endPos,
      startTarget: controls.target.clone(),
      endTarget,
      startFov: camera.fov,
      endFov: this.unitsConfig.unitPoiCameraFov,
      startTime: performance.now(),
      durationMs: Math.max(1, this.unitsConfig.unitPoiTransitionMs),
    };
    return true;
  }

  /** Where the given unit currently sits in the camera's own frame.
   * `onScreen` is true only when its centre is in front of the camera and
   * inside the frustum; `coverage` is its bounding sphere's angular radius
   * as a fraction of the vertical half-FOV, so ~1 means it fills the frame
   * top to bottom and ~0.05 means it is a speck. Null when the unit isn't
   * in the registry at all (not loaded, or genuinely unmapped) — callers
   * use that to tell "no block for this unit" apart from "there is a block
   * and it happens to be off screen", which are two very different things
   * to tell a visitor.
   *
   * Exists so a list selection can decide whether it needs to move the
   * camera at all. Flying on EVERY row tap is its own kind of broken: on a
   * project whose units are all one tower already filling the frame, every
   * tap became a teleport that re-framed roughly the same picture, and the
   * visitor loses the orientation they had built up. Angular size rather
   * than a second projected silhouette point — cheaper, and it stays
   * stable when the camera is very close to the block.
   *
   * Deliberately says nothing about occlusion: `unitBlocksXrayEnabled`
   * defaults to true, which makes unit blocks draw through the facade, so
   * "behind geometry" is not normally a reason a selected block can't be
   * seen. */
  getUnitViewportState(unitId: string): { onScreen: boolean; coverage: number; poiAuthored: boolean } | null {
    const entry = this.unitRegistry.get(unitId);
    const camera = this.camera;
    if (!entry || !camera) return null;
    const centre = entry.worldCenter.clone();
    const distance = camera.position.distanceTo(centre);
    const ndc = centre.project(camera);
    const onScreen = ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
    const halfFovRad = (camera.fov * Math.PI) / 360;
    const coverage =
      distance > 1e-6 && halfFovRad > 0 ? Math.atan(entry.worldBoundingSphere.radius / distance) / halfFovRad : 1;
    // "Did a human actually aim this unit's camera, or is it sitting on
    // schema defaults?" — the three POI fields are all
    // admin-authored and all default to a neutral value, so anything
    // non-neutral means someone chose it. Callers use this to decide
    // between honouring an authored framing and falling back to
    // revealUnit()'s generic one.
    const poiAuthored =
      entry.poiYawDeg !== 0 || entry.poiDistanceOverride != null || entry.poiHeightOverride != null;
    return { onScreen, coverage, poiAuthored };
  }

  /** Brings a unit into a readable frame WITHOUT using its authored POI —
   * keeps the camera's current viewing direction and only re-targets and
   * dollies along it, so the unit ends up centred and a known fraction of
   * the frame tall.
   *
   * This exists because focusUnit() is only as good as the data behind it,
   * and that data is very often absent. focusUnit() places the camera at a
   * flat offset rotated by the unit's own `poiYawDeg`; on a unit nobody has
   * aimed (yaw 0, no distance/height override) that is an arbitrary
   * compass direction at a distance derived purely from the block's own
   * radius, which on a real project put the camera INSIDE the tower
   * looking at the back of a floor slab — verified on tower-vlora, whose
   * three units all sit on defaults. A visitor who taps a unit and is
   * teleported inside a wall is worse off than one who was left alone.
   *
   * Preserving the incoming direction also preserves the visitor's
   * orientation, which is the whole objection to framing on every tap: the
   * building does not spin, it just comes closer and centres on what was
   * asked for. FOV is deliberately left alone for the same reason — a FOV
   * change on top of a move reads as a lens swap, not as approaching. */
  revealUnit(unitId: string, screenBiasY = 0, frameFraction = 0.35): boolean {
    const entry = this.unitRegistry.get(unitId);
    const camera = this.camera;
    const controls = this.controls;
    if (!entry || !camera || !controls) return false;
    this.idleDrone.notifyInteraction(performance.now());

    const endTarget = entry.worldCenter.clone();
    // Current viewing direction, target -> camera. Falls back to a plain
    // offset in the degenerate case where the camera sits exactly on its
    // own target (never happens with OrbitControls, but a zero-length
    // vector would silently produce NaNs downstream).
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0.35, 1);
    direction.normalize();

    const halfFovRad = (camera.fov * Math.PI) / 360;
    const radius = Math.max(entry.worldBoundingSphere.radius, 1e-3);
    // Solve tan(theta) = radius / distance for the theta that makes the
    // unit's angular radius `frameFraction` of the vertical half-FOV.
    const targetAngle = Math.max(0.01, halfFovRad * frameFraction);
    const distance = Math.max(radius * 2, radius / Math.tan(targetAngle));

    // `screenBiasY` places the unit somewhere other than dead centre, in
    // NDC (+1 top, -1 bottom). It exists because "centred in the canvas"
    // and "where the visitor can see it" are not the same place once a UI
    // surface covers part of that canvas — on a phone the units sheet owns
    // the bottom half, so a perfectly centred reveal lands the unit
    // squarely behind it. Shifting the whole view down (target AND camera
    // together, so the viewing direction is untouched) raises the unit in
    // frame. To land at NDC y = b the view moves by D·b·tan(halfFov)
    // along the camera's own up axis, derived from the actual viewing
    // direction rather than world up so it stays correct for a tilted
    // camera.
    if (screenBiasY !== 0) {
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction);
      if (right.lengthSq() > 1e-8) {
        const up = new THREE.Vector3().crossVectors(direction, right.normalize()).normalize();
        endTarget.addScaledVector(up, -screenBiasY * Math.tan(halfFovRad) * distance);
      }
    }

    this.cameraTransition = {
      startPos: camera.position.clone(),
      endPos: endTarget.clone().add(direction.multiplyScalar(distance)),
      startTarget: controls.target.clone(),
      endTarget,
      startFov: camera.fov,
      endFov: camera.fov,
      startTime: performance.now(),
      durationMs: Math.max(1, this.unitsConfig.unitPoiTransitionMs),
    };
    return true;
  }

  /** §18 — clears any Units-mode isolate/selection and reframes on the
   * whole loaded scene, the same real reframe frameLoadedContent() itself
   * does (Shots/Camera already use resetView() for this exact "back to
   * the whole building" behavior — reused here rather than duplicated). */
  resetUnitCamera() {
    this.selectedUnitId = null;
    this.isolatedUnitId = null;
    this.refreshUnitRegistryAndAppearance();
    this.resetView();
  }

  /** Read-only snapshot for callers that need unit metadata without
   * reaching into engine internals (e.g. a Units-tab "N/E/S/W badge"
   * showing whether a unit is currently mapped/loaded). */
  getUnitRegistrySnapshot(): { unitId: string; unitCode: string; poiYawDeg: number }[] {
    return Array.from(this.unitRegistry.values()).map((e) => ({ unitId: e.unitId, unitCode: e.unitCode, poiYawDeg: e.poiYawDeg }));
  }

  /** Ground alignment (PRD §5) — the Y offset that would put this model's
   * lowest point exactly at world Y=0, given its CURRENT scale/rotation.
   * Returns null if the slot isn't loaded. Caller applies+persists it
   * (this doesn't mutate anything itself, matching every other Scene-tab
   * control being an explicit, savable edit). */
  computeGroundAlignOffset(slotId: string): number | null {
    const root = this.modelRootsBySlot.get(slotId);
    if (!root) return null;
    const box = new THREE.Box3().setFromObject(root);
    const currentY = root.position.y;
    const lowestY = box.min.y;
    return currentY - lowestY;
  }

  /** Real world-space bounding box of the currently loaded content —
   * Sections' "New Section"/"New Floor Section" uses this to place a
   * sensible default footprint/height, instead of hardcoding world
   * origin (which is only where the CAMERA orbit target starts, not
   * necessarily anywhere near the actual GLB — confirmed via a real bug
   * this exact gap caused: a project whose content sits well off-origin
   * got a brand-new section that clipped away nearly the whole building,
   * only grazing a thin edge slice, because the box and the building
   * barely overlapped). Null before anything has loaded. */
  getContentBounds(): { centerX: number; centerZ: number; minY: number; maxY: number; sizeX: number; sizeZ: number } | null {
    const b = this.contentBounds;
    if (!b) return null;
    return { centerX: b.center.x, centerZ: b.center.z, minY: b.min.y, maxY: b.max.y, sizeX: b.size.x, sizeZ: b.size.z };
  }

  /** Every real THREE.Mesh currently in clippingGroup — the actual
   * clippable content the section-fill cap borrows geometry from (back
   * faces only, see rebuildSectionCap's own doc comment). */
  private collectClippableMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.clippingGroup?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    return meshes;
  }

  /** Removes every real color-fill mesh (sectionFillMeshes) — does NOT
   * dispose their geometry (borrowed from the real source mesh in
   * clippingGroup, never owned/disposed here). */
  private clearSectionFillMeshes() {
    for (const mesh of this.sectionFillMeshes) {
      this.sectionFillClippingGroup?.remove(mesh);
    }
    this.sectionFillMeshes = [];
  }

  /** Sections module cap — restored technique from the pre-rebuild engine
   * (real, production-verified): NOT a stencil trick (broken under this
   * app's WebGPURenderer, confirmed via a real screenshot once before —
   * see this method's git history if that's ever needed again). Instead,
   * every clippable mesh's geometry is reused (buffer shared, not
   * copied) by a second, BackSide-material mesh sharing the exact same
   * clipping planes — where the real front face got clipped away, that
   * mesh's back face (visible from inside the cut) shows a solid color
   * fill. `fillGapsEnabled: false` shows a plain translucent unclipped
   * indicator rectangle instead (editing aid only, matches the drawn
   * footprint). */
  private rebuildSectionCap(section: Section | null) {
    const helpers = this.sectionHelperGroup;
    if (!helpers) return;
    if (this.sectionIndicatorMesh) {
      helpers.remove(this.sectionIndicatorMesh);
      this.sectionIndicatorMesh.geometry.dispose();
      this.sectionIndicatorMesh = null;
    }
    this.clearSectionFillMeshes();
    if (!section) return;

    if (section.fillGapsEnabled) {
      if (!this.sectionFillClippingGroup) {
        this.sectionFillClippingGroup = new THREE.ClippingGroup();
        helpers.add(this.sectionFillClippingGroup);
      }
      this.sectionFillClippingGroup.clippingPlanes = buildSectionPlanes(section);

      if (!this.sectionFillMaterial) {
        this.sectionFillMaterial = new THREE.MeshBasicMaterial({ color: section.fillColor, side: THREE.BackSide });
      } else {
        this.sectionFillMaterial.color.set(section.fillColor);
      }

      for (const source of this.collectClippableMeshes()) {
        const fillMesh = new THREE.Mesh(source.geometry, this.sectionFillMaterial);
        fillMesh.matrixAutoUpdate = false;
        fillMesh.matrix.copy(source.matrixWorld);
        fillMesh.frustumCulled = false;
        fillMesh.castShadow = false;
        fillMesh.receiveShadow = false;
        fillMesh.renderOrder = 10;
        this.sectionFillClippingGroup.add(fillMesh);
        this.sectionFillMeshes.push(fillMesh);
      }
    } else {
      const geometry = buildSectionCapGeometry(section);
      if (!this.sectionIndicatorMaterial) {
        this.sectionIndicatorMaterial = new THREE.MeshBasicMaterial({
          color: SECTION_INDICATOR_COLOR,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      }
      const mesh = new THREE.Mesh(geometry, this.sectionIndicatorMaterial);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 10;
      helpers.add(mesh);
      this.sectionIndicatorMesh = mesh;
    }
  }

  /** Activates a section by real clip + cap, or clears it (null). Does
   * not itself attach/detach an editing gizmo (no viewport drag-authoring
   * yet — Sections tab uses numeric fields this pass, see the panel's own
   * doc comment). */
  activateSection(section: Section | null) {
    this.activeSectionId = section?.id ?? null;
    if (this.clippingGroup) {
      this.clippingGroup.clippingPlanes = section ? buildSectionPlanes(section) : NO_ACTIVE_SECTION_PLANES;
    }
    this.rebuildSectionCap(section);
  }

  getActiveSectionId(): string | null {
    return this.activeSectionId;
  }

  /** Recomputes boundingRadius from currently loaded content and, only on
   * the very FIRST successful load (hasFramedOnce false), positions the
   * camera at the real cameraStartDistanceMultiplier distance — matching
   * the pre-rebuild engine's formula exactly. Every load after that just
   * updates boundingRadius (so distance-limit/far-plane math tracks the
   * real content size) without yanking the camera away from wherever the
   * admin currently has it pointed. */
  private frameLoadedContent() {
    const { camera, controls, loadedRoots } = this;
    if (!camera || !controls || loadedRoots.length === 0) return;
    const box = new THREE.Box3();
    loadedRoots.forEach((root) => box.union(new THREE.Box3().setFromObject(root)));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.contentBounds = { min: box.min.clone(), max: box.max.clone(), center: center.clone(), size: size.clone() };
    this.boundingRadius = Math.max(size.x, size.y, size.z, 1) * 0.65 || 20;

    if (!this.hasFramedOnce) {
      this.hasFramedOnce = true;
      const startDistance = this.boundingRadius * this.cameraConfig.cameraStartDistanceMultiplier;
      controls.target.copy(center);
      camera.position.set(center.x + startDistance, center.y + startDistance * 0.7, center.z + startDistance);
      // Idle Drone Camera PRD §62 — the idle clock starts at Viewer Ready,
      // not at engine construction (which would burn part of the delay
      // during GLB/texture loading).
      this.idleDrone.notifyInteraction(performance.now());
    }
    // Idle Drone Camera PRD §20-21 — real bounds every time content
    // (re)loads, so the orbit always scales to the CURRENT building, not
    // a stale one from before a Replace.
    this.idleDrone.setBounds({ center: center.clone(), buildingHeight: Math.max(size.y, 1), groundMinY: box.min.y, boundingRadius: this.boundingRadius });
    if (this.showDronePath) this.rebuildDronePathHelper();
    this.applyCameraConfig(this.cameraConfig);
    // Real bug this avoids: without re-deriving sunDistance/re-applying
    // the Environment config once real content bounds are known, the sun
    // (and the ground disc's own sizing) would stay locked to the
    // world-origin/boundingRadius=20 placeholder used before anything
    // loaded — same class of gap Sections' own getContentBounds fix
    // (Phase B) addressed for section placement.
    this.sunDistance = Math.max(200, this.boundingRadius * 3);
    this.applyEnvironmentConfig(this.environmentConfig, false);

    // Lighting tab — a real shadow-camera frustum sized to the actual
    // loaded content (same "was locked to the placeholder boundingRadius
    // of 20" bug class as sunDistance above — the sun's shadow camera
    // needs to be this. Bias/normalBias scaled to boundingRadius, not a
    // fixed absolute value (negligible against a real building tens of
    // meters across otherwise — shadow acne).
    if (this.sun) {
      const shadowSpan = this.boundingRadius * 1.5;
      this.sun.shadow.camera.left = -shadowSpan;
      this.sun.shadow.camera.right = shadowSpan;
      this.sun.shadow.camera.top = shadowSpan;
      this.sun.shadow.camera.bottom = -shadowSpan;
      this.sun.shadow.camera.near = Math.max(0.1, this.sunDistance - this.boundingRadius * 2);
      this.sun.shadow.camera.far = this.sunDistance + this.boundingRadius * 2;
      this.sun.shadow.bias = -0.00005 * this.boundingRadius;
      this.sun.shadow.normalBias = 0.01 * this.boundingRadius;
      this.sun.shadow.camera.updateProjectionMatrix();
      this.csmSystem?.updateFrustums();
    }
  }

  /** Reframes the camera on the currently loaded content — resets the
   * "already framed once" latch so it re-runs the real start-distance
   * placement, same as a fresh mount would. */
  resetView() {
    this.hasFramedOnce = false;
    this.frameLoadedContent();
  }

  setPerfStatsEnabled(enabled: boolean) {
    this.showPerfStats = enabled;
    if (!enabled) this.callbacks.onPerfStats(null);
  }

  /** The real, throttled resize work — see mount()'s ResizeObserver doc
   * comment for why this is throttled at all instead of running inline. */
  private performResize(container: HTMLDivElement, camera: THREE.PerspectiveCamera, renderer: THREE.WebGPURenderer) {
    this.lastResizeAt = performance.now();
    if (!container.clientWidth || !container.clientHeight) return;
    this.isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    // Both branches still need a real setSize() call on resize — see
    // createRenderer()'s own doc comment for why (Three's internal
    // render-target sizing must track the real canvas, even one Mapbox
    // owns/resizes itself). Basemap mode skips effectiveRenderScale for
    // the same reason it does at mount time.
    if (this.map) {
      renderer.setSize(container.clientWidth, container.clientHeight, false);
    } else {
      renderer.setSize(container.clientWidth * this.effectiveRenderScale, container.clientHeight * this.effectiveRenderScale, false);
    }
  }

  /** Real current renderScale (post any adaptive/interaction reduction) —
   * for the status bar's Quality Profile readout. */
  getEffectiveRenderScale(): number {
    return this.effectiveRenderScale;
  }

  /** Camera tab (PRD §37) — applies every field live, no remount. Safe to
   * call on every slider drag (matches the Materials/Model-transform
   * live-preview pattern). */
  setCameraConfig(config: CameraConfig) {
    this.cameraConfig = config;
    this.applyCameraConfig(config);
  }

  private applyCameraConfig(config: CameraConfig) {
    const { camera, controls, container } = this;
    if (!camera || !controls || !container) return;
    this.isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
    camera.fov = this.isMobileViewport ? config.cameraFovMobile : config.cameraFovDesktop;
    camera.near = config.cameraNearClip;
    // Real bug found live (not the "intermittent race" it first looked
    // like — screenshot analysis showed the exact same y-position/height
    // on every affected tab): the SkyMesh dome is a fixed-size backdrop
    // at SKY_DOME_SCALE (1600 units) radius, entirely independent of an
    // admin's artistic/perf cameraFarClip choice. Any project configured
    // with a realistic near-field cameraFarClip (e.g. this app's own demo
    // project ships 100) put the dome's own geometry beyond camera.far,
    // so it was silently frustum-culled outright — the clear color
    // (black) showed through wherever the dome would have been, while
    // the ground plane (much closer to the camera) rendered normally.
    // The sky dome must never be subject to the admin's scene-geometry
    // far-clip setting, so it gets its own floor here.
    camera.far = Math.max(config.cameraFarClip, this.boundingRadius * 8, SKY_DOME_SCALE * 1.1);
    camera.updateProjectionMatrix();

    controls.enableRotate = config.cameraOrbitEnabled;
    controls.enablePan = config.cameraPanEnabled;
    controls.enableZoom = config.cameraZoomEnabled;
    controls.enableDamping = config.cameraDampingEnabled;
    controls.dampingFactor = 0.08;
    // Idle Drone Camera PRD §53 — "ROZARIS owns automated movement;
    // OrbitControls remains the manual navigation system." The two never
    // fight: autoRotate only actually spins when a project has the drone
    // turned off, preserving today's plain-spin fallback for it.
    controls.autoRotate = config.autoRotate && !config.idleDroneEnabled;
    controls.minDistance = this.boundingRadius * config.cameraMinDistanceMultiplier;
    controls.maxDistance = this.boundingRadius * config.cameraMaxDistanceMultiplier;
    controls.minPolarAngle = THREE.MathUtils.degToRad(config.cameraMinPolarDeg);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
    // OrbitControls' own defaults (unrestricted) when null — same
    // "nullable means off" contract the schema field itself documents.
    controls.minAzimuthAngle = config.cameraMinAzimuthDeg != null ? THREE.MathUtils.degToRad(config.cameraMinAzimuthDeg) : -Infinity;
    controls.maxAzimuthAngle = config.cameraMaxAzimuthDeg != null ? THREE.MathUtils.degToRad(config.cameraMaxAzimuthDeg) : Infinity;
    this.idleDrone.setConfig(config);
    if (this.showDronePath) this.rebuildDronePathHelper();
  }

  // ---------------------------------------------------------------------
  // Environment tab (PRD §7-13) — Sun & Sky, Clouds, Fog & Haze, Water,
  // Ground. PRD §10's "ONE Global Sun Vector" — resolveGlobalSunVector is
  // the only place elevation/azimuth are computed; every feature below
  // reads the resulting `this.sunDirection`, never its own.
  // ---------------------------------------------------------------------

  private isMobileQualityTier(): boolean {
    return this.qualityConfig.qualityPreset === "mobile_low" || this.qualityConfig.qualityPreset === "mobile_high";
  }

  /** PRD §9-10 — off (default): the direct static sunElevationDeg/
   * sunAzimuthDeg, zero behavior change for any project that never opens
   * this tab. On: derived every call from Viewer Time + the selected
   * Solar Path (src/lib/sunPosition.ts). `northOffsetDeg` rotates the
   * result either way. */
  private resolveGlobalSunVector(config: EnvironmentConfig): { elevationDeg: number; azimuthDeg: number } {
    if (!config.solarControllerEnabled) {
      return { elevationDeg: config.sunElevationDeg, azimuthDeg: config.sunAzimuthDeg };
    }
    const raw =
      config.solarPathMode === "geographic"
        ? geographicSunPosition(new Date(config.simulationDate), config.geoLatitude, config.geoLongitude, config.viewerTimeHours)
        : sunPositionForAnchors(config.viewerTimeHours, config.solarAnchors);
    return { elevationDeg: raw.elevationDeg, azimuthDeg: (((raw.azimuthDeg + config.northOffsetDeg) % 360) + 360) % 360 };
  }

  /** Restored near-verbatim from the pre-rebuild engine's own
   * buildGroundMaterial — a real MeshStandardNodeMaterial whose colorNode
   * does a radial fade from groundColor to the resolved fog color around
   * world origin ("Ground Fog" — a different, older technique from Fog &
   * Haze's height-band fog; its controls live in the Fog & Haze panel
   * alongside the rest of fog, but the field/uniform stay ground-owned
   * since the effect paints onto the ground material itself). Gated by
   * BOTH `groundFogEnabled` and the master `fogEnabled` — the master
   * switch must kill every fog-like effect, not just the atmospheric one.
   * Then multiplies in cloudShadowFactor (PRD §11's real, simplified Cloud
   * Shadows). Every knob is a live UniformNode (this.ground*Uniform
   * fields) so toggling never needs a material rebuild. */
  private buildGroundMaterial(config: EnvironmentConfig): THREE.MeshStandardNodeMaterial {
    const groundColorUniform = uniform(new THREE.Color(config.groundColor));
    const groundFogColorUniform = uniform(new THREE.Color(resolveFogColor(config)));
    const groundFogRadiusUniform = uniform(Math.max(1, config.groundFogRadius));
    const groundFogStrengthUniform = uniform(config.fogEnabled && config.groundFogEnabled ? 1 : 0);
    this.groundColorUniform = groundColorUniform;
    this.groundFogColorUniform = groundFogColorUniform;
    this.groundFogRadiusUniform = groundFogRadiusUniform;
    this.groundFogStrengthUniform = groundFogStrengthUniform;

    const cloudShadowStrength = uniform(0);
    const cloudHeightU = uniform(config.cloudHeight);
    const cloudScaleU = uniform(Math.max(0.0001, config.cloudScale));
    const cloudCoverageU = uniform(config.cloudCoverage);
    const cloudWindU = uniform(new THREE.Vector2(0, 0));
    const sunDirU = uniform(this.sunDirection.clone());
    this.groundCloudShadowStrengthUniform = cloudShadowStrength;
    this.groundCloudHeightUniform = cloudHeightU;
    this.groundCloudScaleUniform = cloudScaleU;
    this.groundCloudCoverageUniform = cloudCoverageU;
    this.groundCloudWindUniform = cloudWindU;
    this.groundSunDirectionUniform = sunDirU;

    const material = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    const distanceFromOrigin = tslLength(positionWorld.xz);
    const innerRadius = groundFogRadiusUniform.mul(0.7);
    const fade = tslSmoothstep(innerRadius, groundFogRadiusUniform, distanceFromOrigin).mul(groundFogStrengthUniform);
    const baseColor = tslMix(groundColorUniform, groundFogColorUniform, fade);
    const shadow = cloudShadowFactor(positionWorld, sunDirU, cloudHeightU, cloudScaleU, cloudCoverageU, cloudWindU, cloudShadowStrength);
    material.colorNode = baseColor.mul(shadow);
    return material;
  }

  /** Environment tab (PRD §7-13) — applies every field live, no remount.
   * Safe to call on every slider drag; the expensive PMREM rebuild is
   * debounced internally (scheduleEnvironmentRebuild). */
  setEnvironmentConfig(config: EnvironmentConfig) {
    this.applyEnvironmentConfig(config, false);
  }

  private applyEnvironmentConfig(config: EnvironmentConfig, immediateRebuild: boolean) {
    this.environmentConfig = config;
    const { sun, ambient, scene, skyMesh, waterMesh, groundMesh, cloudSystem } = this;
    if (!sun || !ambient || !scene) return;

    const sunPos = this.resolveGlobalSunVector(config);
    const dir = sunDirectionVector(sunPos);
    this.sunDirection.set(dir.x, dir.y, dir.z);

    const distance = this.sunDistance;
    const center = this.contentBounds?.center ?? new THREE.Vector3();
    sun.position.set(center.x + dir.x * distance, center.y + Math.max(dir.y, 0.05) * distance, center.z + dir.z * distance);
    sun.target.position.copy(center);

    const isNight = sunPos.elevationDeg <= 0;
    if (config.autoSunColorEnabled) {
      sun.color.setHex(sunColorForElevation(sunPos.elevationDeg));
    } else {
      sun.color.set(config.manualSunColorHex);
    }
    sun.intensity = config.autoSunIntensityEnabled
      ? isNight
        ? 0.1
        : 1.2 + Math.max(0, sunPos.elevationDeg / 90) * 1.8
      : config.manualSunIntensity;
    ambient.intensity = isNight ? 0.08 : 0.15;

    const isMobileTier = this.isMobileQualityTier();
    const useRealCloudLayer = config.cloudsEnabled && !isMobileTier;

    if (skyMesh) {
      skyMesh.turbidity.value = config.skyTurbidity;
      skyMesh.rayleigh.value = config.skyRayleigh;
      skyMesh.mieCoefficient.value = config.skyMieCoefficient;
      skyMesh.mieDirectionalG.value = config.skyMieDirectionalG;
      skyMesh.sunPosition.value.copy(this.sunDirection);
      skyMesh.showSunDisc.value = config.sunDiscEnabled ? 1 : 0;
      skyMesh.visible = config.skyEnabled;
      // The real raymarched Clouds layer is the primary system whenever
      // it's active; SkyMesh's own baked-in cloud uniforms are the honest
      // Low/Mobile-tier internal fallback (PRD §11) — never both at once.
      const useFallbackClouds = config.cloudsEnabled && !useRealCloudLayer;
      skyMesh.cloudCoverage.value = useFallbackClouds ? config.cloudCoverage : 0;
      skyMesh.cloudDensity.value = useFallbackClouds ? config.cloudDensity : 0;
      skyMesh.cloudElevation.value = config.cloudElevation;
    }
    if (cloudSystem) {
      cloudSystem.mesh.visible = useRealCloudLayer;
    }

    // 360° Backdrop Photo — cheap live updates (visibility/rotation) run
    // on every call; the texture itself only (re)loads when the URL
    // actually changes, same "expensive work gated behind a real change"
    // discipline as scheduleEnvironmentRebuild below.
    const backdropMesh = this.backdropMesh;
    if (backdropMesh) {
      backdropMesh.rotation.y = THREE.MathUtils.degToRad(config.backdropRotationDeg);
      backdropMesh.rotation.x = THREE.MathUtils.degToRad(config.backdropPitchDeg);
      backdropMesh.position.y = config.backdropElevation;
      backdropMesh.visible = config.backdropEnabled && !!config.backdropImageUrl;
      if (config.backdropImageUrl !== this.backdropImageUrl) {
        this.backdropImageUrl = config.backdropImageUrl;
        const material = backdropMesh.material as THREE.MeshBasicMaterial;
        const previousTexture = material.map;
        if (config.backdropImageUrl) {
          const url = config.backdropImageUrl;
          new THREE.TextureLoader().load(url, (texture) => {
            // The URL can change again (or clear) while this in-flight
            // load was still fetching — only apply it if it's still the
            // one currently requested, and never onto a disposed mesh.
            if (this.backdropImageUrl !== url || !this.backdropMesh) {
              texture.dispose();
              return;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            material.map = texture;
            material.needsUpdate = true;
            previousTexture?.dispose();
          });
        } else {
          material.map = null;
          material.needsUpdate = true;
          previousTexture?.dispose();
        }
      }
    }

    if (waterMesh) {
      waterMesh.visible = config.waterEnabled;
      waterMesh.position.y = config.waterHeight;
      const reflectSun = config.waterSunReflectionEnabled;
      waterMesh.sunDirection.value.copy(reflectSun ? this.sunDirection : new THREE.Vector3(0, 1, 0));
      waterMesh.sunColor.value.setHex(reflectSun ? sunColorForElevation(sunPos.elevationDeg) : 0x000000);
      waterMesh.waterColor.value.set(config.waterColor);
      waterMesh.size.value = config.waterSize;
      const wavesActive = config.waterWavesEnabled && config.waterNormalMapEnabled;
      waterMesh.distortionScale.value = wavesActive ? config.waterDistortionScale : 0;
    }

    if (groundMesh) {
      groundMesh.visible = config.groundEnabled;
      const wantsInfinite = config.groundStyle === "infinite";
      const wantedRadius = Math.max(this.boundingRadius * 1.6, 10);
      const currentIsInfinite = groundMesh.userData.isInfinite === true;
      const currentRadius = groundMesh.userData.discRadius as number | undefined;
      if (wantsInfinite !== currentIsInfinite || (!wantsInfinite && currentRadius !== wantedRadius)) {
        const nextGeometry = wantsInfinite
          ? new THREE.PlaneGeometry(GROUND_INFINITE_SIZE, GROUND_INFINITE_SIZE)
          : new THREE.CircleGeometry(wantedRadius, 48);
        groundMesh.geometry.dispose();
        groundMesh.geometry = nextGeometry;
        groundMesh.userData.isInfinite = wantsInfinite;
        groundMesh.userData.discRadius = wantedRadius;
      }
    }
    if (this.groundColorUniform) this.groundColorUniform.value.set(config.groundColor);
    if (this.groundFogColorUniform) this.groundFogColorUniform.value.set(resolveFogColor(config));
    if (this.groundFogRadiusUniform) this.groundFogRadiusUniform.value = Math.max(1, config.groundFogRadius);
    if (this.groundFogStrengthUniform) this.groundFogStrengthUniform.value = config.fogEnabled && config.groundFogEnabled ? 1 : 0;
    if (this.groundCloudShadowStrengthUniform) {
      this.groundCloudShadowStrengthUniform.value = config.cloudsEnabled && config.cloudShadowsEnabled ? 1 : 0;
    }
    if (this.groundCloudHeightUniform) this.groundCloudHeightUniform.value = config.cloudHeight;
    if (this.groundCloudScaleUniform) this.groundCloudScaleUniform.value = Math.max(0.0001, config.cloudScale);
    if (this.groundCloudCoverageUniform) this.groundCloudCoverageUniform.value = config.cloudCoverage;
    if (this.groundCloudWindUniform) this.groundCloudWindUniform.value.copy(this.cloudSystem?.getWindOffset() ?? new THREE.Vector2());
    if (this.groundSunDirectionUniform) this.groundSunDirectionUniform.value.copy(this.sunDirection);

    this.scheduleEnvironmentRebuild(config, immediateRebuild);
  }

  /** Debounces the real shaded PMREM capture behind ~150ms of idle after
   * the last call — same idiom Camera/Shots' own transitions and the
   * pre-rebuild engine's identical method used. `environmentRefreshEnabled
   * — off` (PRD §9) additionally skips every call AFTER the first
   * successful one, freezing indirect lighting/reflections at their
   * mount-time state as a real perf lever. */
  private scheduleEnvironmentRebuild(config: EnvironmentConfig, immediate: boolean) {
    if (this.environmentRebuildTimer != null) {
      clearTimeout(this.environmentRebuildTimer);
      this.environmentRebuildTimer = null;
    }
    const skyEnabledChangedSinceLastRebuild = this.lastRebuiltSkyEnabled !== null && this.lastRebuiltSkyEnabled !== config.skyEnabled;
    if (this.hasRebuiltEnvironmentOnce && !config.environmentRefreshEnabled && !skyEnabledChangedSinceLastRebuild) return;
    if (immediate) {
      this.rebuildEnvironment(config);
      this.hasRebuiltEnvironmentOnce = true;
      return;
    }
    const mountTokenAtStart = this.mountToken;
    this.environmentRebuildTimer = setTimeout(() => {
      this.environmentRebuildTimer = null;
      if (mountTokenAtStart !== this.mountToken) return;
      this.rebuildEnvironment(config);
      this.hasRebuiltEnvironmentOnce = true;
    }, 150);
  }

  /** Real shaded-sky PMREM capture — restored near-verbatim from the
   * pre-rebuild engine. Temporarily moves the one live `skyMesh` instance
   * into an offscreen `envScene` to capture it (the same mesh is also the
   * visible backdrop, so it can't just live permanently in a separate
   * scene), then back. `skyEnabled: false` captures one cheap flat-color
   * PMREM instead (still-lit scene, no directional sky gradient). */
  private rebuildEnvironment(config: EnvironmentConfig) {
    const scene = this.scene;
    const envScene = this.envScene;
    const pmrem = this.pmrem;
    const skyMesh = this.skyMesh;
    if (!scene || !envScene || !pmrem || !skyMesh) return;
    this.lastRebuiltSkyEnabled = config.skyEnabled;

    if (!config.skyEnabled) {
      skyMesh.visible = false;
      const fallbackColor = new THREE.Color(FOG_SKY_HORIZON_COLOR);
      const prevBackground = envScene.background;
      envScene.background = fallbackColor;
      const renderTarget = pmrem.fromScene(envScene, 0, 0.1, SKY_DOME_SCALE * 1.5, { size: 16 });
      envScene.background = prevBackground;

      this.envRenderTarget?.dispose();
      this.envRenderTarget = renderTarget;
      scene.environment = renderTarget.texture;
      scene.environmentIntensity = config.environmentIntensity;
      scene.background = fallbackColor;
      scene.backgroundIntensity = config.environmentIntensity;
      return;
    }

    skyMesh.visible = true;
    scene.remove(skyMesh);
    envScene.add(skyMesh);
    const renderTarget = pmrem.fromScene(envScene, 0, 0.1, SKY_DOME_SCALE * 1.5, { size: 128 });
    envScene.remove(skyMesh);
    scene.add(skyMesh);

    this.envRenderTarget?.dispose();
    this.envRenderTarget = renderTarget;
    scene.environment = renderTarget.texture;
    scene.environmentIntensity = config.environmentIntensity;
    scene.background = null;
    scene.backgroundIntensity = config.environmentIntensity;
    skyMesh.visible = true;
  }

  // ---------------------------------------------------------------------
  // Lighting tab (PRD §14-21) — Sun Light, Shadows (CSM/Contact/
  // Transmitted), Global Illumination (SSGI), Artificial Lights,
  // Volumetric Lighting. See render-engine/{shadows,postProcessing,
  // artificialLights}.ts for the real per-feature implementations; this
  // is just their live-apply/rebuild-on-structural-change orchestration,
  // same discipline as Environment's own applyEnvironmentConfig.
  // ---------------------------------------------------------------------

  setLightingConfig(config: LightingConfig) {
    this.applyLightingConfig(config);
  }

  private applyLightingConfig(config: LightingConfig) {
    this.lightingConfig = config;
    const { renderer, sun, ambient, scene, camera } = this;
    if (!renderer || !sun || !ambient || !scene || !camera) return;

    // Sun Light (PRD §15) — a real master kill switch on the same ONE sun
    // Environment's own Sun & Sky drives; autoSunIntensityEnabled/
    // autoSunColorEnabled/manualSunIntensity/manualSunColorHex are read
    // from THIS config (shared with EnvironmentConfig's own copies of the
    // same real Project3DConfig fields) inside applyEnvironmentConfig —
    // no duplicate sun-color logic here, just the on/off switch and real
    // shadow-map plumbing.
    sun.visible = config.sunLightEnabled;
    renderer.shadowMap.enabled = config.shadowsEnabled;
    sun.castShadow = config.shadowsEnabled && config.sunLightEnabled;
    sun.shadow.radius = config.shadowSoftness;
    setShadowMapTransmitted(renderer, config.transmittedShadowsEnabled);

    // CSM (PRD §16) — real rebuild only when on/off or cascade count
    // changes (CSMShadowNode's cascade count is fixed at construction);
    // maxDistance/splitMode/margin are cheap property writes +
    // updateFrustums() otherwise.
    const wantsCSM = config.shadowsEnabled && config.sunLightEnabled && config.csmEnabled;
    const needsCSMRebuild = wantsCSM !== (this.csmSystem != null) || (wantsCSM && this.csmSystem != null && this.csmSystem.node.cascades !== config.csmCascades);
    if (needsCSMRebuild) {
      this.csmSystem?.dispose();
      this.csmSystem = wantsCSM ? buildCSMSystem(sun, config) : null;
    } else {
      this.csmSystem?.updateFrustums();
    }

    // Post-processing chain (Contact Shadows/GI/Sun Shafts, PRD §17/19/21)
    // — shares the Rendering tab's own scenePostPipeline (see
    // applyScenePostPipeline's own doc comment); rebuild-vs-live-update
    // is decided there, keyed on BOTH this config and renderingConfig.
    this.applyScenePostPipeline();

    // Artificial Lights (PRD §20) — real add/update/remove diffing.
    void this.artificialLightSystem?.sync(config.artificialLights);

    // Transmitted/Colored Shadows (PRD §18) — re-applied to every already-
    // loaded root; syncModels() applies it to newly-loaded ones too.
    for (const root of this.modelRootsBySlot.values()) {
      applyTransmittedShadows(root, config);
    }
  }

  // ---------------------------------------------------------------------
  // Rendering tab (PRD §22-33) — Reflections (SSR), Anti-Aliasing (TRAA),
  // Camera FX (Bloom/Lens Flare/DOF/Motion Blur), Color (Tone Mapping/
  // Exposure/3D LUT). Extends the SAME shared post pipeline the Lighting
  // tab built (postProcessing.ts's buildScenePostPipeline) — see
  // applyScenePostPipeline below, the one place either tab rebuilds it.
  // ---------------------------------------------------------------------

  /** `antialiasEnabled` (TRAA) is the one renderer-CONSTRUCTION-time flag
   * in this tab (MSAA must be off at the renderer for TRAA to be valid,
   * same category `renderingMode` already is) — everything else applies
   * live via applyRenderingConfig(), no remount. */
  setRenderingConfig(config: RenderingConfig) {
    const antialiasChanged = config.antialiasEnabled !== this.renderingConfig.antialiasEnabled;
    this.renderingConfig = config;
    if (antialiasChanged && this.renderer) {
      void this.remount();
      return;
    }
    this.applyRenderingConfig(config);
  }

  private applyRenderingConfig(config: RenderingConfig) {
    this.renderingConfig = config;
    const { renderer } = this;
    if (!renderer) return;

    // Color (PRD §31-32) — plain renderer properties, not part of the TSL
    // post-processing node graph; live, no rebuild.
    renderer.toneMapping = TONE_MAPPING_MAP[config.toneMapping];
    renderer.toneMappingExposure = config.exposure;

    // 3D LUT (PRD §33) — the texture itself loads async and is cached by
    // preset id (render-engine/lut.ts); kick off/reuse that load here and
    // re-apply once it resolves (same "fire, cache, re-apply on resolve"
    // pattern ArtificialLightSystem/IES already use). A no-op once cached.
    if (config.lutEnabled) {
      ensureLutLoading(config.lutPreset, () => {
        if (this.renderingConfig === config) this.applyScenePostPipeline();
      });
    }

    this.applyScenePostPipeline();
  }

  /** The ONE shared post pipeline both Lighting (Contact Shadows/GI/Sun
   * Shafts) and Rendering (Reflections/Anti-Aliasing/Bloom/Lens Flare/
   * DOF/Motion Blur/LUT) extend (PRD §43) — real rebuild only when WHICH
   * effects are structurally active (or which MRT channels they need)
   * changes; every numeric slider inside an already-active effect is a
   * cheap uniform update via ScenePostPipeline.update() instead. */
  private applyScenePostPipeline() {
    const { renderer, scene, camera, sun } = this;
    if (!renderer || !scene || !camera || !sun) return;
    const signature = computeScenePostSignature(this.lightingConfig, this.renderingConfig);
    if (signature !== this.scenePostSignature) {
      this.scenePostPipeline?.dispose();
      this.scenePostPipeline = buildScenePostPipeline(renderer, scene, camera, sun, this.lightingConfig, this.renderingConfig);
      this.scenePostSignature = signature;
    } else {
      this.scenePostPipeline?.update(this.lightingConfig, this.renderingConfig);
    }
  }

  /** Performance tab (PRD §40) — real, live, no remount. Only
   * renderingMode needs a full remount (see setQualityConfig's own doc
   * comment); everything else here applies to the next resize/frame. */
  setQualityConfig(config: QualityConfig) {
    const renderingModeChanged = config.renderingMode !== this.qualityConfig.renderingMode;
    this.qualityConfig = config;
    if (renderingModeChanged) {
      void this.remount();
      return;
    }
    const target = resolveQualityTarget(config);
    this.effectiveRenderScale = target.renderScale;
    this.downgradeStep = 0;
    if (this.renderer) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, target.dprCap));
    this.applyRenderScale();
  }

  /** renderingMode -> forceWebGL is a renderer-construction-time flag —
   * the only Performance-tab field that needs a real dispose+re-init,
   * same category cameraHelperEnabled/logarithmicDepthBuffer already are
   * in the pre-rebuild engine. Re-mounts on the SAME container, so
   * ThreeProjectViewer.tsx doesn't need to know this happened. */
  private async remount() {
    const container = this.container;
    if (!container) return;
    const showPerfStats = this.showPerfStats;
    const qualityConfig = this.qualityConfig;
    // Real bug this fixes: dispose()+mount() alone leaves a genuinely
    // empty scene (Tris 1) — mount() only sets up the renderer/scene/
    // camera, it never loads content on its own; that's syncModels()'s
    // job, and nothing would call it again since the React-level
    // `detailModels` prop this remount is invisible to hasn't changed.
    const entries = this.lastSyncEntries;
    this.dispose();
    // mount() re-applies this.cameraConfig internally (the field itself
    // survives dispose(), only the THREE objects it configures get torn
    // down) — no separate camera-restore call needed here.
    await this.mount(container, { showPerfStats, qualityConfig });
    await this.syncModels(entries);
  }

  /** Applies effectiveRenderScale (or the temporary interaction-time
   * scale, if lower) to the actual renderer size right now. */
  private applyRenderScale() {
    const { renderer, container } = this;
    if (!renderer || !container || !container.clientWidth || !container.clientHeight) return;
    const scale = this.interactionRenderScale != null ? Math.min(this.interactionRenderScale, this.effectiveRenderScale) : this.effectiveRenderScale;
    renderer.setSize(container.clientWidth * scale, container.clientHeight * scale, false);
  }

  /** PRD §41 "Interaction Performance Strategy" (the runtime half, not
   * the interaction-drag half — see the controls "start"/"end" listeners
   * in mount()): a REAL sustained-low-frame-time downgrade, one step,
   * lowering renderScale — not a fake counter. Only the render-scale
   * lever exists today; SSR/SSGI/volumetric/shadow sample-count steps
   * land with their own Phase 2-4 features (ADAPTIVE_DOWNGRADE_ORDER in
   * viewerPresets.ts already reserves the concept for them). */
  private sampleAdaptiveQuality() {
    if (!this.qualityConfig.adaptiveQualityEnabled || !this.qualityConfig.runtimeQualityReductionEnabled) return;
    if (this.isMobileViewport) return; // mobile always renders at the full configured quality — see isMobileViewport's own doc comment
    if (this.isInteracting) return; // the interaction-time lever already covers this window
    const frames = this.frameTimes;
    if (frames.length < 60 || this.downgradeStep >= 3) return;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    if (avg <= 33) return; // healthy (roughly >=30fps sustained)
    this.effectiveRenderScale = Math.max(0.4, this.effectiveRenderScale * 0.85);
    this.downgradeStep += 1;
    this.frameTimes = []; // fresh window before judging the next step
    this.applyRenderScale();
  }

  /** Shots (PRD §38) — the live camera's current position/target/fov, for
   * "Capture Shot". Null if the renderer isn't ready. */
  getCameraState(): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number } | null {
    const { camera, controls } = this;
    if (!camera || !controls) return null;
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      fov: camera.fov,
    };
  }

  /** Shots (PRD §38) — smoothly transitions to a saved CameraPreset over
   * `preset.durationMs`. Cancelled early if the admin grabs the viewport
   * mid-flight (see the controls "start" listener in mount()). */
  flyToPreset(preset: CameraPreset) {
    const { camera, controls } = this;
    if (!camera || !controls) return;
    this.idleDrone.notifyInteraction(performance.now()); // Idle Drone Camera PRD §18/§43 — Shots always preempt the drone
    this.cameraTransition = {
      startPos: camera.position.clone(),
      endPos: new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z),
      startTarget: controls.target.clone(),
      endTarget: new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z),
      startFov: camera.fov,
      endFov: preset.fov,
      startTime: performance.now(),
      durationMs: Math.max(1, preset.durationMs),
    };
  }

  /** Camera Helper (PRD §4/§37) — a wireframe frustum for a saved Shot,
   * shown while previewing it in the Shots tab (not the live viewport
   * camera's own frustum, which is never visible from inside it). Pass
   * null to clear. */
  showCameraHelperFor(preset: CameraPreset | null) {
    const scene = this.scene;
    if (!scene) return;
    if (this.cameraHelper) {
      scene.remove(this.cameraHelper);
      this.cameraHelper.dispose();
      this.cameraHelper = null;
    }
    if (!preset || !this.cameraConfig) return;
    const previewCam = new THREE.PerspectiveCamera(preset.fov, 16 / 9, this.cameraConfig.cameraNearClip, Math.min(this.boundingRadius * 2, 200));
    previewCam.position.set(preset.position.x, preset.position.y, preset.position.z);
    previewCam.lookAt(preset.target.x, preset.target.y, preset.target.z);
    previewCam.updateProjectionMatrix();
    const helper = new THREE.CameraHelper(previewCam);
    scene.add(helper);
    this.cameraHelper = helper;
  }

  // ---------------------------------------------------------------------
  // Idle Drone Camera PRD §54-55 — the public surface ThreeProjectViewer's
  // imperative handle exposes. Actual per-frame math lives in
  // idleDroneCamera.ts; everything here is thin delegation + the
  // editor-only path-helper visualization (§38-39), which genuinely does
  // belong to RenderEngine (it creates real scene objects, which
  // idleDroneCamera.ts deliberately never does — see its own doc comment).
  // ---------------------------------------------------------------------

  /** §16-17 — any outside-canvas UI trigger (Views/Shot select, Sun&Time
   * scrub, a unit picked from a list, returning to Explore) calls this so
   * the next idle window starts fresh instead of firing instantly off a
   * stale timestamp. */
  resetIdleTimer() {
    this.idleDrone.notifyInteraction(performance.now());
  }

  /** Forces the drone off right now (e.g. an explicit "Reset Camera"
   * action) — same effect as any other notifyInteraction. */
  cancelIdleDrone() {
    this.idleDrone.notifyInteraction(performance.now());
  }

  isIdleDroneActive(): boolean {
    return this.idleDrone.isActive();
  }

  /** §45-47 — Units/Views/Sun&Time modes suspend the drone for as long as
   * the visitor stays there; Explore resumes it (after a fresh delay via
   * resetIdleTimer(), called separately by the caller). */
  setIdleDroneSuspended(suspended: boolean) {
    this.idleDrone.setSuspended(suspended);
  }

  /** §36-37 — Editor "Preview Drone Camera": ignores the idle delay,
   * activates immediately with whatever cameraConfig is currently live
   * (the unsaved draft). */
  startIdleDronePreview() {
    this.idleDrone.startPreview();
  }

  stopIdleDronePreview() {
    this.idleDrone.stopPreview();
  }

  /** §38-39 — editor-only orbit-path helper (three altitude rings + a
   * live position marker). No-op scene-wise for the public viewer, which
   * never calls this. */
  setShowDronePath(enabled: boolean) {
    this.showDronePath = enabled;
    if (enabled) this.rebuildDronePathHelper();
    else this.clearDronePathHelper();
  }

  private clearDronePathHelper() {
    const group = this.dronePathHelperGroup;
    if (!group) return;
    for (const line of this.droneRingLines) {
      group.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.droneRingLines = [];
    if (this.droneMarker) {
      group.remove(this.droneMarker);
      this.droneMarker.geometry.dispose();
      (this.droneMarker.material as THREE.Material).dispose();
      this.droneMarker = null;
    }
  }

  private rebuildDronePathHelper() {
    const group = this.dronePathHelperGroup;
    if (!group) return;
    this.clearDronePathHelper();
    const points = this.idleDrone.getPathPoints();
    if (!points) return;
    const ringColors: Record<"high" | "mid" | "low", number> = { high: 0x60a5fa, mid: 0x818cf8, low: 0xf472b6 };
    (["high", "mid", "low"] as const).forEach((key) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points[key]);
      const material = new THREE.LineBasicMaterial({ color: ringColors[key], transparent: true, opacity: 0.6 });
      const line = new THREE.Line(geometry, material);
      group.add(line);
      this.droneRingLines.push(line);
    });
    const markerGeometry = new THREE.SphereGeometry(Math.max(0.3, this.boundingRadius * 0.03), 12, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    group.add(marker);
    this.droneMarker = marker;
  }

  /** Called every frame (only while showDronePath is on) from the
   * animation loop — keeps the live-position marker following the real
   * camera and only visible while the drone (or its preview) is actually
   * driving it. */
  private updateDronePathHelper() {
    const marker = this.droneMarker;
    const camera = this.camera;
    if (!marker || !camera) return;
    marker.visible = this.idleDrone.isActive();
    marker.position.copy(camera.position);
  }

  /** Async on purpose — WebGPURenderer presents to the canvas on its own
   * schedule relative to `render()` returning (unlike WebGL2's synchronous
   * swap), so reading `toDataURL()` in the same tick can capture a stale
   * or blank frame. Waiting two real animation frames after `render()`
   * before reading pixels is the standard way to guarantee the browser
   * has actually composited what was just drawn. Wrapped in try/catch
   * (not just an `if` guard) since `toDataURL()` itself can throw on a
   * tainted/lost-context canvas — a real failure should surface as `null`
   * to the caller, not an uncaught rejection. */
  async captureScreenshot(): Promise<string | null> {
    if (!this.renderer || !this.scene || !this.camera) return null;
    this.renderer.render(this.scene, this.camera);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      return this.renderer.domElement.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  dispose() {
    this.mountToken++;
    this.syncToken++;
    const renderer = this.renderer;
    if (renderer) renderer.setAnimationLoop(null);
    // "Real-world basemap" mount path — this engine's own repaint-request
    // loop (startBasemapRepaintLoop's own doc comment) has no counterpart
    // in setAnimationLoop(null) above, so it needs its own explicit stop.
    if (this.basemapRafId != null) {
      cancelAnimationFrame(this.basemapRafId);
      this.basemapRafId = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeTimer != null) clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    this.controls?.dispose();
    this.controls = null;
    this.dracoLoader?.dispose();
    this.dracoLoader = null;
    this.loader = null;
    this.loadedRoots = [];
    this.modelRootsBySlot.clear();
    this.loadedGlbUrlBySlot.clear();
    if (renderer) {
      renderer.dispose();
      // Mapbox owns this canvas in basemap mode (see createBasemapRenderer's
      // own doc comment) — map.remove() below tears it down along with
      // every listener Mapbox itself attached; Three must not also remove
      // a DOM node it doesn't own.
      if (!this.map) renderer.domElement.remove();
    }
    this.map?.remove();
    this.map = null;
    this.basemapLayer = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.sun = null;
    this.ambient = null;
    this.container = null;
    this.frameTimes = [];
    this.lastFrameAt = null;
    this.perfSampleCounter = 0;
    this.cameraHelper?.dispose();
    this.cameraHelper = null;
    this.cameraTransition = null;
    this.hasFramedOnce = false;

    // Idle Drone Camera PRD cleanup — real listener removal (not just a
    // dropped reference) since document.addEventListener outlives this
    // engine instance otherwise, and a real scene-object teardown for the
    // path helper (clearDronePathHelper only removes/disposes; the group
    // itself is owned by `scene`, already gone above).
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.visibilityHandler = null;
    this.clearDronePathHelper();
    this.dronePathHelperGroup = null;
    this.showDronePath = false;
    this.idleDrone.reset();
    this.contentBounds = null;
    this.clippingGroup = null;
    this.sectionHelperGroup = null;
    this.activeSectionId = null;
    this.sectionFillClippingGroup = null;
    this.sectionFillMaterial?.dispose();
    this.sectionFillMaterial = null;
    this.sectionIndicatorMaterial?.dispose();
    this.sectionIndicatorMaterial = null;
    this.sectionIndicatorMesh = null;
    this.sectionFillMeshes = [];

    // Units Blocks & POI Layer PRD cleanup.
    disposeUnitBoxAppearanceCaches(this.unitMaterialCache, this.unitOutlineByMesh);
    this.unitSelectionScaleOriginals.clear();
    this.unitRegistry.clear();
    this.unitRaycastTargets = [];
    this.selectedUnitId = null;
    this.hoveredUnitId = null;
    this.isolatedUnitId = null;
    this.unitIdFilter = null;

    // Environment tab (PRD §7-13) cleanup.
    if (this.environmentRebuildTimer != null) clearTimeout(this.environmentRebuildTimer);
    this.environmentRebuildTimer = null;
    this.hasRebuiltEnvironmentOnce = false;
    this.lastRebuiltSkyEnabled = null;
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;
    this.pmrem?.dispose();
    this.pmrem = null;
    this.envScene = null;
    this.skyMesh?.geometry.dispose();
    (this.skyMesh?.material as THREE.Material | undefined)?.dispose();
    this.skyMesh = null;
    this.backdropMesh?.geometry.dispose();
    ((this.backdropMesh?.material as THREE.MeshBasicMaterial | undefined)?.map)?.dispose();
    (this.backdropMesh?.material as THREE.Material | undefined)?.dispose();
    this.backdropMesh = null;
    this.backdropImageUrl = null;
    this.waterMesh?.geometry.dispose();
    (this.waterMesh?.material as THREE.Material | undefined)?.dispose();
    this.waterMesh = null;
    this.groundMesh?.geometry.dispose();
    (this.groundMesh?.material as THREE.Material | undefined)?.dispose();
    this.groundMesh = null;
    this.groundColorUniform = null;
    this.groundFogColorUniform = null;
    this.groundFogRadiusUniform = null;
    this.groundFogStrengthUniform = null;
    this.groundCloudShadowStrengthUniform = null;
    this.groundCloudHeightUniform = null;
    this.groundCloudScaleUniform = null;
    this.groundCloudCoverageUniform = null;
    this.groundCloudWindUniform = null;
    this.groundSunDirectionUniform = null;
    this.cloudSystem?.dispose();
    this.cloudSystem = null;
    this.fogSystem = null;
    this.sunDistance = 200;

    // Lighting/Rendering tab (PRD §14-21, §22-33) cleanup — one shared
    // post pipeline for both.
    this.csmSystem?.dispose();
    this.csmSystem = null;
    this.scenePostPipeline?.dispose();
    this.scenePostPipeline = null;
    this.scenePostSignature = null;
    this.artificialLightSystem?.dispose();
    this.artificialLightSystem = null;
  }
}
