import * as THREE from "three/webgpu";
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
import { FOG_SKY_HORIZON_COLOR, GROUND_INFINITE_SIZE, QUALITY_TIERS, SKY_DOME_SCALE, UNIT_BOX_COLOR, UNIT_BOX_OPACITY, WATER_PLANE_SIZE } from "@/lib/viewerPresets";
import { buildSectionCapGeometry, buildSectionPlanes, NO_ACTIVE_SECTION_PLANES, SECTION_INDICATOR_COLOR } from "./sections";
import type { CameraPreset, EnvironmentConfig, LightingConfig, NodeOverride, Project3DConfig, ProjectDetailModel, RenderingConfig, Section, SceneManifestNode, Unit, UnitMeshLink } from "@/lib/types";

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
}

export interface MountParams {
  showPerfStats?: boolean;
  qualityConfig?: QualityConfig;
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
  private ambient: THREE.AmbientLight | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private resizeObserver: ResizeObserver | null = null;

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
  /** Guards syncModels() calls that race a slower earlier one (e.g. two
   * quick Replace clicks) — each call gets its own token, a late-resolving
   * stale one's GLB load is discarded rather than raced into the scene. */
  private syncToken = 0;

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

  // Camera tab (PRD §37).
  private cameraConfig: CameraConfig = DEFAULT_CAMERA_CONFIG;
  private boundingRadius = 20;

  // Environment tab (PRD §7-13) — see EnvironmentConfig's own doc comment.
  private environmentConfig: EnvironmentConfig = DEFAULT_ENVIRONMENT_CONFIG;
  private envScene: THREE.Scene | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRenderTarget: THREE.RenderTarget | null = null;
  private skyMesh: InstanceType<typeof SkyMesh> | null = null;
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
      if (token === this.mountToken) this.callbacks.onWebglFail();
      return;
    }
    if (token !== this.mountToken) {
      renderer.dispose();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, target.dprCap));
    renderer.setSize(container.clientWidth * this.effectiveRenderScale, container.clientHeight * this.effectiveRenderScale, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    // Real bug fix (Phase 2) — the Environment tab's physically-based
    // Sky/Water/Ground shaders all produce genuine HDR output (a physical
    // sky's luminance routinely exceeds 1.0), and WebGPURenderer's own
    // default is NoToneMapping (hard-clip above 1.0) — without a real
    // curve set before the first PMREM sky capture below, the sky dome
    // renders solid blown-out white instead of a blue gradient. Reads
    // from `this.renderingConfig` (real Rendering → Color tab fields,
    // Phase 4) rather than a hardcoded ACES/1 — by the time this runs,
    // React's setRenderingConfig has already updated the field (same
    // effect-ordering guarantee applyCameraConfig/applyEnvironmentConfig
    // already rely on), so this picks up the real per-project value on
    // first paint, not a default flash.
    renderer.toneMapping = TONE_MAPPING_MAP[this.renderingConfig.toneMapping];
    renderer.toneMappingExposure = this.renderingConfig.exposure;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

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

    const isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
    const cfg = this.cameraConfig;
    const camera = new THREE.PerspectiveCamera(
      isMobileViewport ? cfg.cameraFovMobile : cfg.cameraFovDesktop,
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
      this.isInteracting = true;
      if (this.qualityConfig.interactionQualityReductionEnabled) {
        this.interactionRenderScale = Math.max(0.5, this.effectiveRenderScale * 0.7);
        this.applyRenderScale();
      }
    });
    controls.addEventListener("end", () => {
      this.isInteracting = false;
      this.interactionRenderScale = null;
      this.applyRenderScale();
    });
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

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth * this.effectiveRenderScale, container.clientHeight * this.effectiveRenderScale, false);
    });
    resizeObserver.observe(container);
    this.resizeObserver = resizeObserver;

    const samplePerfStats = () => {
      if (!this.showPerfStats) return;
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
    };

    renderer.setAnimationLoop(() => {
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
      samplePerfStats();
    });
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
    for (const { slotId, model, units, statusPreviewEnabled } of entries) {
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
        this.applyUnitBoxes(existingRoot, model.unitLinks, units ?? [], statusPreviewEnabled ?? true);
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
        this.applyUnitBoxes(root, model.unitLinks, units ?? [], statusPreviewEnabled ?? true);
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
    this.loadedRoots = Array.from(this.modelRootsBySlot.values());
    // Only reframe the camera when something NEW came in — an in-place
    // transform/material edit on already-loaded content must never yank
    // the camera away from wherever the admin currently has it pointed.
    if (loadedSomethingNew) this.frameLoadedContent();
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
      // Unit_<number> boxes get their own dedicated status-color tinting
      // (applyUnitBoxes) — Materials-tab overrides don't apply to them,
      // same exclusion the pre-rebuild engine had.
      if (UNIT_NODE_PATTERN.test(mesh.name)) return;
      if (!this.originalMaterials.has(mesh)) {
        this.originalMaterials.set(mesh, normalizeMaterials(mesh.material));
      }
      const originals = this.originalMaterials.get(mesh)!;
      const override = nameToOverride.get(mesh.name);

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

  /** Unit Mapping's "Status Preview — ON/OFF" (PRD §5) — tints every
   * Unit_<number> box a translucent green/yellow/red by its linked real
   * Unit's status. Off (or unlinked) restores the GLB's own original
   * material, same cache-and-clone discipline as applyNodeOverrides. */
  private applyUnitBoxes(root: THREE.Object3D, unitLinks: UnitMeshLink[], units: Unit[], statusPreviewEnabled: boolean) {
    const unitById = new Map(units.map((u) => [u.id, u]));
    const linkByMesh = new Map(unitLinks.map((l) => [l.meshName, l.unitId]));

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !UNIT_NODE_PATTERN.test(mesh.name)) return;
      if (!this.originalMaterials.has(mesh)) {
        this.originalMaterials.set(mesh, normalizeMaterials(mesh.material));
      }
      const originals = this.originalMaterials.get(mesh)!;
      const unit = statusPreviewEnabled ? unitById.get(linkByMesh.get(mesh.name) ?? "") : undefined;
      const currentIsOriginal = normalizeMaterials(mesh.material).every((m, i) => m === originals[i]);

      if (!unit) {
        if (!currentIsOriginal) {
          normalizeMaterials(mesh.material).forEach((m) => m.dispose());
          mesh.material = originals.length === 1 ? originals[0] : originals;
        }
        return;
      }
      if (!currentIsOriginal) normalizeMaterials(mesh.material).forEach((m) => m.dispose());
      mesh.material = new THREE.MeshBasicMaterial({
        color: UNIT_BOX_COLOR[unit.status],
        transparent: true,
        opacity: UNIT_BOX_OPACITY,
        depthWrite: false,
      });
    });
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
    }
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
    const isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
    camera.fov = isMobileViewport ? config.cameraFovMobile : config.cameraFovDesktop;
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
    controls.autoRotate = config.autoRotate;
    controls.minDistance = this.boundingRadius * config.cameraMinDistanceMultiplier;
    controls.maxDistance = this.boundingRadius * config.cameraMaxDistanceMultiplier;
    controls.minPolarAngle = THREE.MathUtils.degToRad(config.cameraMinPolarDeg);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
    // OrbitControls' own defaults (unrestricted) when null — same
    // "nullable means off" contract the schema field itself documents.
    controls.minAzimuthAngle = config.cameraMinAzimuthDeg != null ? THREE.MathUtils.degToRad(config.cameraMinAzimuthDeg) : -Infinity;
    controls.maxAzimuthAngle = config.cameraMaxAzimuthDeg != null ? THREE.MathUtils.degToRad(config.cameraMaxAzimuthDeg) : Infinity;
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
   * world origin (Ground tab's own "Ground Fog" — a different, older
   * technique from Fog & Haze's height-band fog), then multiplies in
   * cloudShadowFactor (PRD §11's real, simplified Cloud Shadows). Every
   * knob is a live UniformNode (this.ground*Uniform fields) so toggling
   * never needs a material rebuild. */
  private buildGroundMaterial(config: EnvironmentConfig): THREE.MeshStandardNodeMaterial {
    const groundColorUniform = uniform(new THREE.Color(config.groundColor));
    const groundFogColorUniform = uniform(new THREE.Color(resolveFogColor(config)));
    const groundFogRadiusUniform = uniform(Math.max(1, config.groundFogRadius));
    const groundFogStrengthUniform = uniform(config.groundFogEnabled ? 1 : 0);
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
    if (this.groundFogStrengthUniform) this.groundFogStrengthUniform.value = config.groundFogEnabled ? 1 : 0;
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

  captureScreenshot(): string | null {
    if (!this.renderer || !this.scene || !this.camera) return null;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose() {
    this.mountToken++;
    this.syncToken++;
    const renderer = this.renderer;
    if (renderer) renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
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
      renderer.domElement.remove();
    }
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
