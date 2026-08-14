import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  pass,
  positionWorld,
  length as tslLength,
  smoothstep,
  mix,
  uniform,
  texture3D,
  uv,
  vec3,
  vec4,
  color as tslColor,
  mx_fractal_noise_float,
} from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { lut3D } from "three/examples/jsm/tsl/display/Lut3DNode.js";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { LUTCubeLoader } from "three/examples/jsm/loaders/LUTCubeLoader.js";
import { LUT3dlLoader } from "three/examples/jsm/loaders/LUT3dlLoader.js";
import { LUTImageLoader } from "three/examples/jsm/loaders/LUTImageLoader.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
// Sky/Water/Bloom/Clouds "Ocean" tab — WebGPU-native counterparts of
// webgl_shaders_ocean.html's classic `Sky`/`Water` (those two are
// WebGLRenderer-only, per their own source doc comments; `SkyMesh`/
// `WaterMesh` are the TSL/NodeMaterial ports for this app's
// WebGPURenderer pipeline). `SkyMesh` already ships the demo's "Clouds"
// GUI folder baked in as 3 more uniforms on the same shader — no separate
// cloud object exists in either version.
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import { WaterMesh } from "three/examples/jsm/objects/WaterMesh.js";
import { buildCausticsUnitEmissiveNode, loadCausticsTexture, type CausticsUnitUniforms } from "./caustics";
// webgl_shadowmap_viewer.html parity — the WebGPU-native port
// (ShadowMapViewerGPU.js), not the classic WebGLRenderer-only
// ShadowMapViewer.js (see this app's WebGPURenderer-first architecture).
import { ShadowMapViewer } from "three/examples/jsm/utils/ShadowMapViewerGPU.js";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { applyUnitBoxMaterial, disposeGlbObject3D } from "@/lib/glbUnitNodes";
import { sunColorForElevation, sunDirectionVector } from "@/lib/sunPosition";
import {
  ADAPTIVE_DOWNGRADE_ORDER,
  FOG_SKY_HORIZON_COLOR,
  GLASS_NODE_PATTERN,
  GLASS_TIERS,
  GROUND_INFINITE_SIZE,
  LUT_PRESETS,
  MATERIAL_PRESETS,
  QUALITY_TIERS,
  SELECTED_COLOR,
  SKY_DOME_SCALE,
  UNIT_BOX_COLOR,
  UNIT_BOX_OPACITY,
  UNIT_BOX_SELECTED_OPACITY,
  WATER_PLANE_SIZE,
  type QualityTierSettings,
} from "@/lib/viewerPresets";
import {
  buildSectionCapGeometry,
  buildSectionPlanes,
  NO_ACTIVE_SECTION_PLANES,
  sectionFromDragPoints,
  SECTION_INDICATOR_COLOR,
  SECTION_MAX_DIMENSION_M,
} from "./sections";
import type { CameraPreset, Project, Project3DConfig, ProjectDetailModel, Section, Unit, UnitMeshLink } from "@/lib/types";

export type AvailabilityFilter = "all" | Unit["status"];

export interface UnitFilters {
  status: AvailabilityFilter;
  bedrooms: number | null;
  bathrooms: number | null;
  minArea: number | null;
}

interface GlbUnitBoxEntry {
  node: THREE.Object3D;
  unitId: string;
}

const UNIT_NODE_PATTERN = /^Unit_/i;
const MOBILE_VIEWPORT_BREAKPOINT = 768; // matches Tailwind's `md` — used for FOV/quality only, not a full UA probe
/** Sky/Water/Bloom/Clouds "Ocean" tab's Bloom group — strength/radius are
 * real per-project sliders, threshold isn't (matches
 * webgl_shaders_ocean.html's own Bloom GUI folder exactly, which only
 * exposes those two). Was previously a per-project `bloomThreshold`
 * field; fixed back to the same 0.85 the demo hardcodes. */
const BLOOM_THRESHOLD_DEFAULT = 0.85;

export interface RenderEngineCallbacks {
  /** i18n — only used for the WebGPU-unavailable message. */
  t: (key: string) => string;
  onReady: (ready: boolean) => void;
  onWebglFail: (reason: string | null) => void;
  /** Fired when the detail GLB itself fails to load — the caller flips
   * `usingGlb` off (via `glbLoadFailed` state), which changes `mount()`'s
   * own params on the next call and naturally falls back to procedural
   * massing. The engine doesn't decide that fallback itself — same
   * division of responsibility as the original component (React owns
   * `usingGlb`, the engine just reports the failure). */
  onGlbLoadFailed: () => void;
  /** Fired only when the hovered unit id actually changes — drives React
   * state (`setHoveredUnit`). Deliberately NOT fired on every pointer
   * move (see onPointerMove below) — that would mean a full React
   * re-render per pixel of mouse movement. */
  onHoverChange: (unit: Unit | null) => void;
  /** Fired on every pointer move over the canvas, regardless of whether
   * the hovered unit changed — for imperative (non-React-state) tooltip
   * positioning, same "avoid a render per pixel" reasoning as above. Only
   * called while a unit is actually hovered (matches the original's own
   * `if (tooltipElRef.current && nextHoverId)` guard). */
  onPointerMove: (clientX: number, clientY: number) => void;
  onSelectUnit?: (unit: Unit) => void;
  onPerfStats: (stats: { fps: number; drawCalls: number; triangles: number; dpr: number } | null) => void;
  /** Sections module — fires continuously while a section gizmo is being
   * dragged (every "objectChange" tick) so `SectionsPanel`'s numeric
   * fields stay live without a React round-trip per frame (same reasoning
   * OrbitControls' camera position isn't itself React state). Optional,
   * same as `onSelectUnit` — only the admin editor supplies it. */
  onSectionDraftChange?: (section: Section) => void;
  /** Real bug fix (Sections audit, 2026-08-13): `onSectionDraftChange`
   * above only ever drove a local display value (`EditorShell.tsx`'s
   * `liveSectionOverride`) — nothing wrote a gizmo drag's result back
   * into `draft.sections`, the actual state `handleSaveScene`/autosave
   * PATCH. That meant Move/Rotate/Resize/Height gizmo edits were 100%
   * visual: they looked right in the live preview and the panel's own
   * numbers while dragging, but "Save" (or autosave) would silently
   * persist the *pre-drag* section, since nothing else ever changed.
   * Fired once, from the gizmo's `dragging-changed` listener transitioning
   * to "not dragging" (`attachSectionGizmo`) — a drag is one discrete
   * undo/save-worthy edit, not a per-tick stream like the callback above. */
  onSectionDraftCommit?: (section: Section) => void;
}

/** One detail-model slot's currently-relevant model, keyed by its real
 * `DetailModelSlot.id` (Multiple Detail-Model Slots pass) — a project can
 * have several independently-placed/versioned GLBs loaded and rendered
 * simultaneously ("Building", "Surroundings", ...). */
export interface DetailModelSlotEntry {
  slotId: string;
  model: ProjectDetailModel;
}

export interface MountParams {
  project: Project;
  config: Project3DConfig;
  detailModels: DetailModelSlotEntry[];
  usingGlb: boolean;
  /** Whatever the component's selection/filter state happens to be at the
   * moment this particular mount runs — matches the original component's
   * setup() closing over that render's ENTIRE props/state (not
   * necessarily today's live values; the very next
   * `applyLiveUpdate`/`refreshAppearance` call re-applies with fresh ones
   * once `ready`, same two-pass behavior as before). Also doubles as the
   * initial `refreshAppearance` call at the end of mount() — see there. */
  selectedUnitId: string | null;
  filters: UnitFilters;
  showUnitBoxes: boolean;
  /** True for the admin editor's own live preview, false for every
   * public-facing viewer — see `this.isEditorPreview`'s field doc
   * comment for what this drives (Sections module cap rendering). */
  isEditorPreview: boolean;
}

export interface LiveUpdateParams {
  project: Project;
  config: Project3DConfig;
  detailModels: DetailModelSlotEntry[];
  usingGlb: boolean;
}

export interface SunEnvironmentParams {
  config: Project3DConfig;
}

export interface RefreshAppearanceParams {
  project: Project;
  config: Project3DConfig;
  usingGlb: boolean;
  selectedUnitId: string | null;
  filters: UnitFilters;
  showUnitBoxes: boolean;
}

/**
 * ROZARIS's 3D Experience render engine — rewrite Track B, Phase 1
 * ("extract a real engine module... React components never directly
 * mutate Three.js scene objects. All mutations flow through engine
 * commands"). This is a faithful extraction of what previously lived as
 * closures/refs directly inside `ProceduralProjectViewer.tsx`: every
 * method here is the same logic that used to be a function or `useEffect`
 * body in that component, moved onto a class instance so React's role is
 * reduced to "construct one engine per mount, call its methods, read its
 * callbacks" — never touching a `THREE.*` object itself.
 *
 * One instance is created per `ProceduralProjectViewer` component instance
 * and lives across `mount()`/`dispose()` cycles (a project switch calls
 * `dispose()` then `mount()` again on the SAME instance) — exactly the
 * same lifecycle the original refs had, since refs also persisted across
 * the setup effect's cleanup+rerun.
 *
 * Deliberately NOT split into GLBManager/MaterialManager/etc. sub-modules
 * yet (unlike the master PRD's aspirational package structure) — that
 * finer decomposition is real future work, not required to fix the
 * specific architectural violation this phase targets (React mutating
 * Three.js directly). One class with clearly-named methods already
 * satisfies "all mutation flows through engine commands."
 */
export class RenderEngine {
  private callbacks: RenderEngineCallbacks;

  private container: HTMLDivElement | null = null;
  private renderer: THREE.WebGPURenderer | null = null;
  private scene: THREE.Scene | null = null;
  private envScene: THREE.Scene | null = null;
  private pmrem: InstanceType<typeof THREE.PMREMGenerator> | null = null;
  private envRenderTarget: { texture: THREE.Texture; dispose: () => void } | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private ground: THREE.Mesh | null = null;
  /** Ground Platform's real "ground fog" (Sky/Water/Bloom/Clouds follow-up)
   * — 4 live `UniformNode`s feeding `ground`'s `MeshStandardNodeMaterial.
   * colorNode`, built once per mount in `buildGroundMaterial`. The node
   * graph's *shape* never changes — `groundFogStrengthUniform` just goes
   * 0↔1 — so even the `groundFogEnabled` toggle is a cheap live update
   * (see `applyLiveUpdate`), not a pipeline rebuild. */
  // Typed by their `.value` shape directly (not `ReturnType<typeof
  // uniform>`) — that generic collapses `.value` to `unknown` without the
  // call-site argument type to infer from.
  private groundColorUniform: { value: THREE.Color } | null = null;
  private groundFogColorUniform: { value: THREE.Color } | null = null;
  private groundFogRadiusUniform: { value: number } | null = null;
  private groundFogStrengthUniform: { value: number } | null = null;
  private sun: THREE.DirectionalLight | null = null;
  /** Real shadow-map debug HUD (`webgl_shadowmap_viewer.html` parity) —
   * admin-only debug aid, not a `Project3DConfig` field (same
   * "not persisted, session-only" category as `showPerfStats`). Lazily
   * constructed the first frame `this.sun.shadow.map` actually exists
   * (per `ShadowMapViewerGPU.js`'s own doc comment: a light's shadow map
   * only initializes after its first render pass with shadows on) —
   * `shadowMapViewerEnabled` can flip true before that frame happens, the
   * render loop just waits. Only meaningful in a full-window viewer: the
   * addon positions/sizes itself in `window.innerWidth`/`innerHeight`
   * terms internally, not this app's own `container` div, so it's only
   * wired into the public viewer (a real full-viewport canvas) — the
   * admin editor's smaller embedded preview panel would place the HUD
   * using the wrong coordinate basis. */
  private shadowMapViewer: InstanceType<typeof ShadowMapViewer> | null = null;
  private shadowMapViewerEnabled = false;
  /** The scene's bounding-box center, computed once per mount() — `sun.target`
   * is pointed here once and never moves again, so `applySunAndEnvironment`
   * needs the same point to offset `sun.position` by; otherwise the sun's
   * actual direction (position - target) only matches the intended
   * elevation/azimuth when the scene happens to sit near the world origin. */
  private sceneCenter: THREE.Vector3 | null = null;
  /** Real distance (world units) from `sceneCenter` to `sun.position`,
   * computed once per mount() from that mount's own `boundingRadius` (a
   * fixed project scales tiny to huge) and reused as-is by
   * `applySunAndEnvironment` every time it repositions the sun along the
   * current elevation/azimuth. Root-caused, real bug this field fixes:
   * before it existed, `applySunAndEnvironment` placed the sun at a
   * hardcoded 200 units from `sceneCenter` while `sun.shadow.camera.far`
   * (set once here, in mount()) was only `boundingRadius * 6` — for any
   * project with `boundingRadius` under ~33 (most procedural-massing
   * projects; real observed case: boundingRadius ≈ 26), that far plane
   * (≈156) sat *closer* to the light than the light itself (200 units
   * out), so the shadow camera's frustum never contained the sun's own
   * scene-facing side at all — the shadow map allocated a real texture
   * and rendered every frame, just always empty. No shadow anywhere, on
   * any object, regardless of `shadowsEnabled`/bias/mapSize — all of
   * which were individually correct and did nothing, because the
   * occluders never made it into the depth pass in the first place.
   * Real-GPU-verified (Playwright + a real WebGPU context, not the
   * headless software-rasterizer fallback) against a live project before
   * and after this fix. */
  private sunDistance = 200;
  // --- Sky/Water/Bloom/Clouds "Ocean" tab ---
  /** The physical sky dome — the scene's only backdrop now (live in the
   * scene like webgl_shaders_ocean.html's `sky`, not painted onto
   * `scene.background`). Built once per mount(); `null` only before the
   * first mount()/after dispose(). */
  private skyMesh: SkyMesh | null = null;
  /** Last real sun *direction* (unit vector, world space) computed by
   * `applySunAndEnvironment` — `sun.position` itself is an absolute point
   * offset from `sceneCenter`, not a direction, so this is kept separately
   * to feed `skyMesh.sunPosition`/`waterMesh.sunDirection` exactly like
   * the reference demo's own `sun` Vector3 feeds both. */
  private sunDirection = new THREE.Vector3(0, 1, 0);
  /** The optional water plane (`WaterMesh`) — only constructed when
   * `config.waterEnabled` (per-project opt-in; most projects have none).
   * Real click-responsiveness bug fix (2026-08-14, Configurator audit):
   * this used to be mount()-only, meaning the Ocean tab's "Water Enabled"
   * checkbox triggered a full engine teardown/rebuild (new WebGPU
   * renderer + context, every GLB reloaded from the network, PMREM
   * environment regenerated) just to add one mesh — confirmed with a real
   * Playwright repro to visibly freeze the Configurator for seconds and
   * eat the next several clicks (matches the "need to triple-click"
   * report exactly). `setWaterEnabled` below now adds/removes this one
   * self-contained mesh live instead, same "cheap update" category as
   * everything else `applyLiveUpdate` already drags without a remount —
   * `createWaterMesh` is the shared construction code both it and
   * mount() call. */
  private waterMesh: WaterMesh | null = null;
  /** The bloom node itself (not just a boolean) — `strength`/`radius` are
   * real `UniformNode<float>`s on this instance (confirmed against
   * BloomNode.js's own source), so `applyLiveUpdate` can drag those live
   * without rebuilding the whole post-processing pipeline. `bloomEnabled`
   * itself used to also force a full engine remount (same over-broad
   * "structural" categorization `waterEnabled` had — see its own doc
   * comment above); it's now handled by `applyLiveUpdate` calling
   * `buildRenderPipeline` again on its own, which was already a cheap,
   * self-contained node-graph rebuild with no renderer/context/GLB work
   * in it — the expensive part of a remount was never this. */
  private bloomNode: ReturnType<typeof bloom> | null = null;
  /** The currently-loaded LUT's real `Data3DTexture` (whichever of
   * `LUTCubeLoader`/`LUT3dlLoader`/`LUTImageLoader` its preset's `format`
   * dispatches to — see `LUT_PRESETS`/`loadLut`) — `null` until `loadLut`
   * resolves. `lutPresetLoaded` tracks which preset id it corresponds to,
   * so a redundant reload is skipped. `lutIntensity` is a real live
   * `UniformNode<float>` (`Lut3DNode`'s own `intensityNode`), draggable
   * via `applyLiveUpdate` with no rebuild; `lutEnabled`/`lutPreset`
   * themselves need a fresh mount (structural + a real async texture
   * load), same category as `bloomEnabled`. */
  private lutTexture: THREE.Data3DTexture | null = null;
  private lutPresetLoaded: string | null = null;
  private lutIntensity: ReturnType<typeof uniform> | null = null;
  /** Depth of field (`webgl_postprocessing_dof2.html` parity) — 3 real
   * live `UniformNode<float>`s (`DepthOfFieldNode`'s own constructor just
   * stores whatever node it's given, unlike `BloomNode`'s auto-uniform-
   * wrapping, so these are created explicitly here). `dofFocusDistance`
   * is the odd one out: recomputed
   * every frame in the render loop (`camera.position.distanceTo(controls.target)`,
   * real auto-focus) rather than dragged from a config field —
   * `dofFocalLength`/`dofBokehScale` are the two that `applyLiveUpdate`
   * drags from real per-project sliders. `depthOfFieldEnabled` itself
   * needs a fresh mount (structural), same category as `bloomEnabled`. */
  private dofFocusDistance: ReturnType<typeof uniform> | null = null;
  private dofFocalLength: ReturnType<typeof uniform> | null = null;
  private dofBokehScale: ReturnType<typeof uniform> | null = null;
  /** Loading-screen reveal (`webgl_postprocessing_transition.html`
   * technique, ported to a real procedural TSL fractal-noise mask instead
   * of the reference demo's static texture — no extra vendored asset
   * needed, and this app's own version needs a single reusable mask, not
   * a per-transition-style picker). NOT a `Project3DConfig` field —
   * automatic engine behavior, not an admin toggle: plays once for ~1.1s
   * the moment mount() has its first frame ready to show (see mount()'s
   * own `revealActive = true` line), then the render loop tears the node
   * back out of the pipeline entirely (one more `buildRenderPipeline`
   * call) so it costs nothing on every subsequent frame afterward. */
  private revealThreshold: ReturnType<typeof uniform> | null = null;
  private revealActive = false;
  private revealStartTime = 0;
  /** Debounces the expensive PMREM rebuild inside `applySunAndEnvironment`
   * — see `scheduleEnvironmentRebuild`. */
  private environmentRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private ambient: THREE.AmbientLight | null = null;

  private renderPipeline: InstanceType<typeof THREE.RenderPipeline> | null = null;
  private effectiveTier: QualityTierSettings;
  private frameTimes: number[] = [];
  private lastFrameAt: number | null = null;
  private downgradeStep = 0;
  private perfSampleCounter = 0;
  /** Set directly by the component every render (same pattern the
   * original `showPerfStatsRef.current = showPerfStats` used) so the
   * animation loop always reads the current prop without needing a
   * dedicated effect/mount just to toggle a debug overlay. */
  showPerfStats = false;
  private cameraTransition: {
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endPos: THREE.Vector3;
    endTarget: THREE.Vector3;
    startFov: number;
    endFov: number;
    startTime: number;
    durationMs: number;
  } | null = null;

  // Procedural mode
  private unitMeshes = new Map<string, THREE.Mesh>();
  private unitBoxes: UnitBox[] = [];
  /** Unit-status caustics (`webgpu_caustics.html` parity, see caustics.ts)
   * — procedural-mode units only. `causticsTexture` is the one real
   * vendored asset, loaded once per mount; `causticsScaleUniform`/
   * `causticsSpeedUniform` are shared live `UniformNode`s (one value for
   * every unit); `causticsUnitUniforms` holds each unit's own real
   * `color`/`intensity` uniforms (genuinely different per unit by status)
   * — `applyUnitAppearance` updates those live on every hover/select/
   * status refresh. `causticsEnabled` itself needs a fresh mount
   * (structural — upgrades each unit's material to a real NodeMaterial). */
  private causticsTexture: THREE.Texture | null = null;
  private causticsScaleUniform: ReturnType<typeof uniform> | null = null;
  private causticsSpeedUniform: ReturnType<typeof uniform> | null = null;
  private causticsUnitUniforms = new Map<string, CausticsUnitUniforms>();

  // GLB mode — one root per detail-model slot (Multiple Detail-Model
  // Slots pass), keyed by slotId. `glbUnitBoxes` keys became
  // `` `${slotId}:${meshName}` `` (see applyDetailUnitLinks) so two
  // different slots' GLBs coincidentally sharing a node name can't
  // collide — `pickable` stays keyed by the real (globally unique)
  // unitId, no change needed there.
  private glbRoots = new Map<string, THREE.Group>();
  private glbUnitBoxes = new Map<string, GlbUnitBoxEntry>();

  private pickable = new Map<string, THREE.Object3D>();
  private hoveredId: string | null = null;
  private defaultCamera: { position: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;

  // Sections module (first-class Configurator module) — manual clipping-
  // plane authoring/runtime. `clippingGroup` wraps every "clippable"
  // object (GLB root / procedural ground+shells+unit boxes) — a
  // `THREE.ClippingGroup` is the WebGPURenderer-only mechanism for this
  // (encodes clipping into the scene graph); there is no equivalent to
  // the classic `WebGLRenderer`'s per-material `clippingPlanes` +
  // `renderer.localClippingEnabled` in this app's unified WebGPURenderer
  // pipeline (WebGL2 fallback included — both run through the same
  // renderers/common/* code, confirmed by reading three's own source
  // rather than assumed). Starts with `clippingPlanes: []` (no clipping)
  // — every existing project renders unchanged until a section is
  // actually activated.
  private clippingGroup: InstanceType<typeof THREE.ClippingGroup> | null = null;
  // Draw-preview rectangle, gizmo helper, and the active section's cap —
  // deliberately NOT inside `clippingGroup` (editing chrome must stay
  // visible regardless of the very clip it's controlling), and hidden
  // entirely in the public runtime except the one active section's cap.
  private sectionHelperGroup: THREE.Group | null = null;
  private sectionDrawPreview: THREE.Line | null = null;
  private drawSection: { onMove: (e: PointerEvent) => void; onClick: (e: PointerEvent) => void } | null = null;
  private sectionGizmo: InstanceType<typeof TransformControls> | null = null;
  private sectionGizmoAnchor: THREE.Object3D | null = null;
  /** The section currently being live-edited via the gizmo — kept in sync
   * with the anchor's transform on every "objectChange" tick; read back
   * by `getLiveSectionDraft()`/streamed via `onSectionDraftChange`. */
  private liveSection: Section | null = null;
  /** The translucent, unclipped "clip plane indicator" rectangle —
   * `fillGapsEnabled: false`, editor-only (see `rebuildSectionCap`'s own
   * doc comment). Its own dedicated material (`sectionIndicatorMaterial`)
   * is never toggled/reused for anything else, unlike the old shared
   * cap material this replaced — see the 2026-08-14 doc note on
   * `rebuildSectionCap` for why that mattered. */
  private sectionIndicatorMesh: THREE.Mesh | null = null;
  private sectionIndicatorMaterial: THREE.MeshBasicMaterial | null = null;
  /** Real color fill (`fillGapsEnabled: true`) — one mesh per real
   * clippable object currently in `clippingGroup`, sharing that object's
   * own geometry (not cloned) and world transform, rendered `BackSide`
   * only and clipped by the section's own full plane set. All share
   * `sectionFillMaterial` (color updated in place, no per-mesh material).
   *
   * **Real bug fixed 2026-08-14** ("colors the clipper plane instead [of
   * the clipped model]", the second time — see this field's own history
   * below): this used to be a stencil-buffer technique (invisible marking
   * mesh pairs + a stencil-tested flat cap quad, the classic
   * webgl_clipping_stencil.html approach) — structurally correct
   * (verified against the actual upstream example source, and against
   * this app's own `ClippingGroup`/`ClippingContext` consumers, unlike
   * two earlier bugs in this same area — see the git history/memory for
   * "rozaris-3d-sections-audit-fix" round 3), but empirically confirmed
   * BROKEN in a real browser once this session finally opened one: the
   * cap rendered its fill color across the *entire* screen, not just the
   * real cut silhouette — the `NotEqualStencilFunc`/ref-0 test was not
   * gating visibility at all under this app's `THREE.WebGPURenderer`.
   * Root cause not fully chased down (WebGPU's own stencil pipeline state
   * plumbing for a plain `MeshBasicMaterial`'s classic stencil properties
   * is comparatively new/less-traveled code in three.js next to its
   * mature WebGL backend) — rather than keep debugging an engine-level
   * stencil gap, this replaces the whole technique with one that doesn't
   * need a stencil buffer at all: rendering the solid's own *back* faces,
   * clipped to the section volume, IS a correct, self-contained "what
   * does the inside of this cut look like" fill — back faces only exist
   * where the mesh itself does, so there's no separate test to get wrong.
   * `stencil: true` came back off the `WebGPURenderer` constructor
   * (mount(), below) since nothing here needs it anymore. */
  private sectionFillMeshes: THREE.Mesh[] = [];
  private sectionFillMaterial: THREE.MeshBasicMaterial | null = null;
  /** Bounds the fill meshes to the section's own clip volume (the exact
   * same `buildSectionPlanes(section)` the main `clippingGroup` uses) —
   * without this, a source mesh's back faces would show through
   * everywhere they're not occluded, not just within the cut. */
  private sectionFillClippingGroup: THREE.ClippingGroup | null = null;
  private activeSectionId: string | null = null;
  /** True for the admin editor's own live preview (`showChrome={false}`),
   * false for every public-facing viewer — set once at `mount()` from
   * `MountParams.isEditorPreview`. Drives whether an inactive section's
   * "clip plane indicator" cap renders at all (editor-only aid) vs. a
   * real `fillGapsEnabled` fill, which renders in both. */
  private isEditorPreview = false;

  /** The latest project/config passed to any apply/refresh method — see
   * the class doc comment on why this is a mutable field rather than a
   * value frozen at mount() time: it reproduces the original code's
   * "closures always see the render that last caused their owning effect
   * to fire" behavior, since every method here is only ever called from
   * the component's effects. */
  private project: Project;
  private config: Project3DConfig;
  /** id -> Unit, rebuilt every time `project` changes (see `setProject`)
   * — Phase 3's UnitManager fix: hover/click used to do a linear
   * `project.units.find(...)` scan on every pointer event; this makes
   * that O(1). Plain JS Map, no GPU resource, so it needs no explicit
   * disposal in `dispose()`. */
  private unitById = new Map<string, Unit>();
  /** Reused `MeshBasicMaterial`s for GLB unit boxes, keyed by
   * `(status, selected, hovered, xray)` — Phase 3's UnitManager fix for
   * `applyUnitBoxMaterial`'s old dispose-and-reallocate-every-call
   * pattern (see glbUnitNodes.ts's doc comment). Rebuilt per mount()
   * (fresh project/GLB), disposed in `dispose()`. */
  private unitMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

  private disposeGeometry: (() => void) | null = null;
  private dracoLoader: DRACOLoader | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private handleMove: ((e: PointerEvent) => void) | null = null;
  private handleClick: ((e: PointerEvent) => void) | null = null;
  private handleLeave: (() => void) | null = null;
  private mountToken = 0;

  constructor(callbacks: RenderEngineCallbacks, initialProject: Project, initialConfig: Project3DConfig) {
    this.callbacks = callbacks;
    this.project = initialProject;
    this.unitById = new Map(initialProject.units.map((u) => [u.id, u]));
    this.config = initialConfig;
    this.effectiveTier = QUALITY_TIERS[initialConfig.qualityPreset];
  }

  /** The one place `this.project` is ever assigned — keeps `unitById` from
   * ever going stale relative to it. Every prior direct `this.project =`
   * assignment site (constructor aside, which seeds both fields directly
   * above) now calls this instead. */
  private setProject(project: Project) {
    this.project = project;
    this.unitById = new Map(project.units.map((u) => [u.id, u]));
  }

  /** Refreshes the callbacks object (component recreates it every render
   * with fresh closures over the latest props — e.g. `onSelectUnit`,
   * `t`). Assigned directly, same "always current, no effect needed"
   * pattern as `showPerfStats` above. */
  setCallbacks(callbacks: RenderEngineCallbacks) {
    this.callbacks = callbacks;
  }

  private matchesFilters(u: Unit, filters: UnitFilters): boolean {
    if (filters.status !== "all" && u.status !== filters.status) return false;
    if (filters.bedrooms != null && u.bedrooms < filters.bedrooms) return false;
    if (filters.bathrooms != null && u.bathrooms < filters.bathrooms) return false;
    if (filters.minArea != null && u.area < filters.minArea) return false;
    return true;
  }

  resetCamera() {
    const controls = this.controls;
    const camera = this.camera;
    const start = this.defaultCamera;
    if (!controls || !camera || !start) return;
    // An in-flight camera-preset transition would otherwise overwrite this
    // snap right back toward the preset on the very next animation-loop
    // tick — Home would appear to silently do nothing if clicked while a
    // preset was still easing in.
    this.cameraTransition = null;
    camera.position.copy(start.position);
    controls.target.copy(start.target);
    // A preset can change FOV; Home should restore the project's real
    // starting FOV too, not just position.
    camera.fov = start.fov;
    camera.updateProjectionMatrix();
    controls.update();
  }

  /** North Sign — rotates the camera to a canonical heading (theta=0)
   * around the current target. */
  resetToNorth() {
    const controls = this.controls;
    const camera = this.camera;
    if (!controls || !camera) return;
    this.cameraTransition = null;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta = 0;
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  /** Starts a smooth eased transition to a saved camera preset ("never
   * visibly teleport") rather than snapping. Stepped from the animation
   * loop's stepCameraTransition; cleared early if the user starts
   * dragging OrbitControls mid-flight. */
  jumpToCameraPreset(preset: CameraPreset) {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return;
    this.cameraTransition = {
      startPos: camera.position.clone(),
      startTarget: controls.target.clone(),
      endPos: new THREE.Vector3(preset.position.x, preset.position.y, preset.position.z),
      endTarget: new THREE.Vector3(preset.target.x, preset.target.y, preset.target.z),
      startFov: camera.fov,
      endFov: preset.fov,
      startTime: performance.now(),
      durationMs: Math.max(100, preset.durationMs || 900),
    };
  }

  captureScreenshot(): string | null {
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return null;
    // Known Phase-1 gap: WebGPURenderer has no `preserveDrawingBuffer`
    // equivalent, so this can occasionally return a blank frame on the
    // WebGPU backend specifically. A real off-screen-render-target capture
    // is the fix, sequenced separately.
    if (this.renderPipeline) this.renderPipeline.render();
    else renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  }

  // "Render this" (webgl_renderer_pathtracer.html parity, `renderPathTraceScreenshot`)
  // — removed entirely 2026-08-14 at the user's explicit request ("remove
  // this from my platform everywhere"). Was a one-shot photorealistic
  // path-traced screenshot built on the `three-gpu-pathtracer` npm
  // dependency (also removed, see package.json) — the isolated
  // pathTraceScreenshot.ts module this delegated to is deleted, not left
  // dead.

  /** Toggles the real shadow-map debug HUD (see its own field doc comment
   * above for the full lifecycle/positioning-scope caveat). Cheap either
   * way: turning it off just drops the reference so it's lazily rebuilt
   * from scratch if re-enabled — no owned GPU resources of its own to
   * dispose (it reads the light's existing `shadow.map.depthTexture`,
   * never creates one — confirmed against `ShadowMapViewerGPU.js`'s own
   * source). */
  setShadowMapViewerEnabled(enabled: boolean) {
    this.shadowMapViewerEnabled = enabled;
    if (!enabled) this.shadowMapViewer = null;
  }

  /** Live compass heading (degrees) — the same `theta` `resetToNorth`
   * drives to 0, just read instead of written. `0` = camera already at
   * the canonical "North Sign" heading; the viewer polls this every frame
   * (cheap: one `atan2`, no allocation beyond a scratch Vector3/Spherical)
   * to keep a compass needle in sync with orbiting, entirely outside
   * React state — see ProceduralProjectViewer.tsx's own compass rAF loop
   * doc comment for why. `null` before the camera/controls exist. */
  getCameraAzimuthDeg(): number | null {
    const controls = this.controls;
    const camera = this.camera;
    if (!controls || !camera) return null;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    return THREE.MathUtils.radToDeg(spherical.theta);
  }

  getCameraState(): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number } | null {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera || !controls) return null;
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      fov: camera.fov,
    };
  }

  private applyUnitAppearance(mesh: THREE.Mesh, box: UnitBox, params: { selectedUnitId: string | null; filters: UnitFilters }) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const isSelected = box.unit.id === params.selectedUnitId;
    const isHovered = box.unit.id === this.hoveredId;
    const unitColors = this.resolveUnitColors();
    // `?? unitColors.available`: Postgres's `Unit.status` column is an
    // unconstrained String (no DB enum) as of the Units read-migration —
    // this Record lookup would otherwise silently resolve to `undefined`
    // for any value outside "available"/"reserved"/"sold"/"selected".
    material.color.setHex(isSelected ? unitColors.selected : unitColors[box.unit.status] ?? unitColors.available);
    material.emissive.setHex(isSelected ? unitColors.selected : isHovered ? 0x333333 : 0x000000);
    material.emissiveIntensity = isSelected ? 0.35 : isHovered ? 0.5 : 0;
    material.roughness = 0.6;
    material.metalness = 0.05;

    // Unit-status caustics — real per-unit live uniforms (color/intensity
    // genuinely vary by status), updated on every hover/select/status
    // refresh same as the rest of this method. No-op (map lookup miss)
    // when caustics is disabled or this unit's material was never
    // upgraded — see the mount()-time construction loop.
    const causticsUniforms = this.causticsUnitUniforms.get(box.unit.id);
    if (causticsUniforms) {
      causticsUniforms.color.value.setHex(unitColors[box.unit.status] ?? unitColors.available);
      causticsUniforms.intensity.value = this.resolveCausticsIntensity(box.unit.status);
    }

    mesh.visible = this.matchesFilters(box.unit, params.filters);
  }

  /** Resolves the 4 admin-configurable unit-status colors (added alongside
   * the full-configurator pass) from `this.config`, defaulting to the
   * original hardcoded `UNIT_BOX_COLOR`/`SELECTED_COLOR` constants for any
   * project row saved before these fields existed (same `?? default`
   * pattern this codebase already established for new config fields —
   * belt-and-suspenders alongside the Prisma column defaults, since a
   * stale in-memory `Project3DConfig` object could still be missing them
   * mid-session). Hex strings are converted once per call via
   * `THREE.Color` rather than cached — this runs on hover/select/filter
   * changes, not every frame, so the allocation is cheap enough not to be
   * worth a cache. */
  private resolveUnitColors(): Record<Unit["status"], number> & { selected: number } {
    const c = this.config;
    const hex = (value: string | undefined, fallback: number) =>
      value ? new THREE.Color(value).getHex() : fallback;
    return {
      available: hex(c?.unitColorAvailable, UNIT_BOX_COLOR.available),
      reserved: hex(c?.unitColorReserved, UNIT_BOX_COLOR.reserved),
      sold: hex(c?.unitColorSold, UNIT_BOX_COLOR.sold),
      selected: hex(c?.unitColorSelected, SELECTED_COLOR),
    };
  }

  /** Unit-status caustics — availability half of the "Availability, color,
   * caustics properties" linkage the feature was built against. Real
   * admin sliders, not a hardcoded ratio. */
  private resolveCausticsIntensity(status: Unit["status"]): number {
    const c = this.config;
    if (status === "available") return c?.causticsIntensityAvailable ?? 1;
    if (status === "reserved") return c?.causticsIntensityReserved ?? 0.4;
    return c?.causticsIntensitySold ?? 0;
  }

  private refreshGlbUnitBoxAppearance(params: { selectedUnitId: string | null; filters: UnitFilters; showUnitBoxes: boolean }) {
    const unitColors = this.resolveUnitColors();
    this.glbUnitBoxes.forEach(({ node, unitId }) => {
      const unit = this.unitById.get(unitId);
      if (!unit) {
        node.visible = false;
        return;
      }
      const isSelected = unitId === params.selectedUnitId;
      const isHovered = unitId === this.hoveredId;
      node.visible = params.showUnitBoxes && this.matchesFilters(unit, params.filters);
      const color = isSelected ? unitColors.selected : unitColors[unit.status] ?? unitColors.available;
      const opacity = isSelected || isHovered ? UNIT_BOX_SELECTED_OPACITY : UNIT_BOX_OPACITY;
      // Color is part of the cache key (not just status|selected|hovered)
      // — an admin changing a status color mid-session must produce a
      // fresh cache entry, not silently reuse a stale-colored cached
      // material. Old-color entries become orphaned in the Map until the
      // next full mount() rebuild (which already disposes and recreates
      // the whole cache) — acceptable for a bounded admin editing
      // session, same trade-off already accepted for the cache's
      // hover/select dimensions.
      const cacheKey = `${unit.status}|${isSelected}|${isHovered}|${color}`;
      applyUnitBoxMaterial(node, color, opacity, this.unitMaterialCache, cacheKey);
    });
  }

  /** Re-evaluates per-unit appearance whenever selection, filters,
   * construction progress or the Unit-Search panel toggle change. Also
   * remembers `params` so the pointer handlers (hover/click, set up once
   * in `mount()` and never recreated) can trigger the same refresh with
   * up-to-date data without needing their own fresh closure — mirrors the
   * original component's plain-function-in-render-body pattern, where
   * every call site always saw that render's latest props/state. */
  refreshAppearance(params: RefreshAppearanceParams) {
    this.setProject(params.project);
    this.config = params.config;
    this.lastRefreshParams = params;
    if (params.usingGlb) {
      this.refreshGlbUnitBoxAppearance({
        selectedUnitId: params.selectedUnitId,
        filters: params.filters,
        showUnitBoxes: params.showUnitBoxes,
      });
    } else {
      this.unitBoxes.forEach((box) => {
        const mesh = this.unitMeshes.get(box.unit.id);
        if (mesh) {
          this.applyUnitAppearance(mesh, box, {
            selectedUnitId: params.selectedUnitId,
            filters: params.filters,
          });
        }
      });
    }
  }

  /** Applies a detail model's placement transform to its loaded root —
   * runs both at initial GLB load and again from `applyLiveUpdate`
   * whenever Admin's scale/rotation/altitude sliders change, without a
   * full GLB reload. */
  private applyDetailTransform(root: THREE.Object3D, scale: number, rotationDeg: number, altitudeOffset: number) {
    root.scale.setScalar(scale);
    root.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
    root.position.y = altitudeOffset;
  }

  /** Builds the meshName -> unitId map and hides/registers pickable unit
   * nodes on an already-loaded GLB root. Restores any node that was
   * linked (and hidden) by a previous call but is no longer linked back to
   * its normal unlinked-visibility rule first — otherwise toggling a link
   * off would leave that mesh permanently hidden from the earlier pass. */
  /** `slotId`-scoped (Multiple Detail-Model Slots pass) — the old
   * unconditional `.clear()` of `glbUnitBoxes`/`pickable` would wipe out
   * every OTHER already-processed slot's tracked nodes when this runs in
   * a per-slot loop; instead only this slot's own previous keys (the
   * `` `${slotId}:` `` prefix `glbUnitBoxes` entries carry) are removed
   * before repopulating. */
  private applyDetailUnitLinks(slotId: string, root: THREE.Object3D, unitLinks: UnitMeshLink[]) {
    const linkByName = new Map(unitLinks.map((l) => [l.meshName, l.unitId]));
    const prefix = `${slotId}:`;
    for (const [key, entry] of Array.from(this.glbUnitBoxes.entries())) {
      if (!key.startsWith(prefix)) continue;
      const meshName = key.slice(prefix.length);
      if (!linkByName.has(meshName)) entry.node.visible = !UNIT_NODE_PATTERN.test(meshName);
      this.glbUnitBoxes.delete(key);
      this.pickable.delete(entry.unitId);
    }
    root.traverse((child) => {
      const unitId = linkByName.get(child.name);
      if (!unitId) {
        if (UNIT_NODE_PATTERN.test(child.name)) child.visible = false;
        return;
      }
      child.visible = false;
      child.userData.unitId = unitId;
      this.glbUnitBoxes.set(`${prefix}${child.name}`, { node: child, unitId });
      this.pickable.set(unitId, child);
    });
  }

  /** Replaces every `Glass_*`-named node's material with a real
   * MeshPhysicalMaterial tuned by the project's `glassPreset` — this is
   * what makes glazing read as transmissive/reflective instead of flat,
   * which only looks convincing against a real environment map (see
   * rebuildEnvironment below). */
  private applyGlassPreset(root: THREE.Object3D, glassPreset: Project3DConfig["glassPreset"], environmentIntensity: number) {
    const tier = GLASS_TIERS[glassPreset];
    root.traverse((child) => {
      if (!GLASS_NODE_PATTERN.test(child.name)) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const prevColor =
        !Array.isArray(mesh.material) && (mesh.material as THREE.MeshStandardMaterial)?.color
          ? (mesh.material as THREE.MeshStandardMaterial).color.clone()
          : new THREE.Color(0xdfeaf2);
      const prev = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
      else prev?.dispose();
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: prevColor,
        transmission: tier.transmission,
        roughness: tier.roughness,
        ior: tier.ior,
        thickness: tier.thickness,
        transparent: tier.transmission === 0,
        opacity: tier.transmission === 0 ? 0.35 : 1,
        envMapIntensity: environmentIntensity,
      });
    });
  }

  /** Admin's Scene Explorer classification/material overrides — runs after
   * applyGlassPreset so it customizes specific nodes on top of their
   * baseline treatment, not the other way round.
   * Overrides are stored keyed by rzNodeId; resolving which live Object3D
   * that refers to is still name-based via a `name -> override` map built
   * from the fetched sceneManifest — same limitation UnitMeshLink already
   * has (see rewrite Track B step 4, stable-ID resolution). */
  private applyNodeOverrides(root: THREE.Object3D, detailModel: ProjectDetailModel | null) {
    const overrides = detailModel?.nodeOverrides ?? [];
    const manifest = detailModel?.sceneManifest ?? [];
    if (overrides.length === 0) return;
    const rzToOverride = new Map(overrides.map((o) => [o.rzNodeId, o]));
    const nameToOverride = new Map(
      manifest.flatMap((n) => {
        const override = rzToOverride.get(n.rzNodeId);
        return override ? [[n.name, override] as const] : [];
      })
    );
    if (nameToOverride.size === 0) return;
    const unitBoxNodes = new Set(Array.from(this.glbUnitBoxes.values()).map((e) => e.node));
    root.traverse((child) => {
      if (unitBoxNodes.has(child)) return;
      if (GLASS_NODE_PATTERN.test(child.name)) return;
      const override = nameToOverride.get(child.name);
      if (!override) return;

      // Helper nodes (guide/reference geometry a 3D artist left in) are
      // hidden by default — the one concrete runtime effect classification
      // gets; Landscape/Interaction are organizational only for now. An
      // explicit `visible: true` override still wins.
      if (override.classification === "helper" && override.visible !== true) {
        child.visible = false;
      }

      const preset = override.materialPreset ? MATERIAL_PRESETS[override.materialPreset] : null;
      // webgl_watch.html parity — clearcoat/iridescence only exist on
      // MeshPhysicalMaterial, not the plain MeshStandardMaterial GLTFLoader
      // produces for an arbitrary uploaded GLB with no clearcoat/
      // iridescence glTF extension of its own.
      const hasClearcoatOverride = override.clearcoat != null || override.clearcoatRoughness != null;
      const hasIridescenceOverride = override.iridescence != null || override.iridescenceIOR != null;
      const hasMaterialOverride = !!(
        preset ||
        override.colorHex ||
        override.roughness != null ||
        override.metalness != null ||
        override.opacity != null ||
        hasClearcoatOverride ||
        hasIridescenceOverride
      );
      const mesh = child as THREE.Mesh;
      if (!hasMaterialOverride || !mesh.isMesh) return;
      const prevMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const nextMaterials = prevMaterials.map((mat) => {
        let std = mat as THREE.MeshStandardMaterial;
        // Upgrade to a real MeshPhysicalMaterial the same way
        // applyGlassPreset already does for Glass_* nodes above, preserving
        // the existing look, rather than setting a property that silently
        // does nothing on a plain MeshStandardMaterial. Skipped once
        // already upgraded (re-runs on every applyNodeOverrides call, e.g.
        // from applyLiveUpdate, not just once) — no repeat allocation.
        if ((hasClearcoatOverride || hasIridescenceOverride) && !(std instanceof THREE.MeshPhysicalMaterial)) {
          const upgraded = new THREE.MeshPhysicalMaterial({
            color: std.color?.clone(),
            map: std.map ?? null,
            normalMap: std.normalMap ?? null,
            roughnessMap: std.roughnessMap ?? null,
            metalnessMap: std.metalnessMap ?? null,
            roughness: std.roughness,
            metalness: std.metalness,
            opacity: std.opacity,
            transparent: std.transparent,
            envMapIntensity: std.envMapIntensity,
          });
          std.dispose();
          std = upgraded;
        }
        if (override.colorHex) std.color?.set(override.colorHex);
        else if (preset) std.color?.setHex(preset.color);
        if (override.roughness != null) std.roughness = override.roughness;
        else if (preset && typeof std.roughness === "number") std.roughness = preset.roughness;
        if (override.metalness != null) std.metalness = override.metalness;
        else if (preset && typeof std.metalness === "number") std.metalness = preset.metalness;
        if (override.opacity != null) {
          std.opacity = override.opacity;
          std.transparent = override.opacity < 1;
        }
        if (std instanceof THREE.MeshPhysicalMaterial) {
          if (override.clearcoat != null) std.clearcoat = override.clearcoat;
          if (override.clearcoatRoughness != null) std.clearcoatRoughness = override.clearcoatRoughness;
          if (override.iridescence != null) std.iridescence = override.iridescence;
          if (override.iridescenceIOR != null) std.iridescenceIOR = override.iridescenceIOR;
        }
        return std;
      });
      mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
    });
  }

  /** Fog color when `config.fogMatchesSky` is on — the "seamless horizon"
   * technique from three.js's webgl_geometry_terrain example (that demo
   * matches its fog color to the sky/clear color so distant geometry
   * fades into the backdrop instead of a visible fog-vs-sky seam). The
   * physical `SkyMesh` (the scene's only backdrop now — see the
   * Sky/Water/Bloom/Clouds "Ocean" tab's own doc comments) has no cheap
   * single "horizon color" to derive from its continuous elevation/
   * azimuth-driven atmosphere without an expensive GPU readback, so this
   * is one fixed, honest approximation (`FOG_SKY_HORIZON_COLOR`) rather
   * than a per-project-accurate one. */
  private resolveFogColor(config: Project3DConfig): string {
    if (!config.fogMatchesSky) return config.fogColor;
    return FOG_SKY_HORIZON_COLOR;
  }

  /** Ground Platform's real "ground fog" (Sky/Water/Bloom/Clouds follow-up)
   * — a deliberately different effect from the `fogEnabled`/`fogColor`
   * `THREE.FogExp2` above (that one fades with distance *from the
   * camera*, affecting the whole scene). This one lives entirely on the
   * ground mesh's own material: a radial fade from `groundColor` to
   * `resolveFogColor(config)` (the same target color the regular fog
   * already resolves to) based on distance from the fixed world origin
   * (0,0,0) — a circular "misty edge" around a specific point the admin
   * chooses a radius for, not a camera-relative depth effect.
   *
   * Built as a `MeshStandardNodeMaterial` (not the plain
   * `MeshStandardMaterial` the old procedural-only ground used) so the
   * fade can be a real TSL `colorNode` while keeping standard PBR
   * shading (roughness, shadow receiving, environment reflections). Every
   * knob is a live `UniformNode` (see the class fields above) — including
   * `groundFogEnabled` itself (`groundFogStrengthUniform` just goes
   * 0↔1) — so nothing here ever needs a pipeline/material rebuild, unlike
   * `bloomEnabled`/`waterEnabled` elsewhere in this pass. */
  private buildGroundMaterial(config: Project3DConfig): THREE.MeshStandardNodeMaterial {
    const groundColorUniform = uniform(new THREE.Color(config.groundColor));
    const groundFogColorUniform = uniform(new THREE.Color(this.resolveFogColor(config)));
    const groundFogRadiusUniform = uniform(Math.max(1, config.groundFogRadius));
    const groundFogStrengthUniform = uniform(config.groundFogEnabled ? 1 : 0);
    this.groundColorUniform = groundColorUniform;
    this.groundFogColorUniform = groundFogColorUniform;
    this.groundFogRadiusUniform = groundFogRadiusUniform;
    this.groundFogStrengthUniform = groundFogStrengthUniform;

    const material = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    // Fade over the inner 30% of the radius rather than a hard-edged
    // circle — an untunable fixed softness (no separate field), same
    // "don't invent an extra slider beyond what's asked" scope discipline
    // as webgl_shaders_ocean.html's own hardcoded bloom threshold.
    const distanceFromOrigin = tslLength(positionWorld.xz);
    const innerRadius = groundFogRadiusUniform.mul(0.7);
    const fade = smoothstep(innerRadius, groundFogRadiusUniform, distanceFromOrigin).mul(groundFogStrengthUniform);
    material.colorNode = mix(groundColorUniform, groundFogColorUniform, fade);
    return material;
  }

  /** Sky/Water/Bloom/Clouds "Ocean" tab — captures the real physical sky
   * dome (`this.skyMesh`, the scene's only backdrop now) via
   * `pmrem.fromScene`, the same "temporarily move the mesh into an
   * offscreen capture scene, then back into the visible one" trick
   * webgl_shaders_ocean.html's own `updateSun()` uses (that single mesh
   * instance is also the visible backdrop, so it can't just live
   * permanently in a separate scene). `size: 128` (PMREMGenerator's own
   * default is 256) cuts the shaded-pixel count ~4x — a PMREM target only
   * feeds blurry indirect lighting/reflections, not a sharp visible
   * image, so this is not a visually meaningful quality loss; real perf
   * fix from the original "Lighting tab doesn't work" report, when this
   * replaced a free flat-gradient-texture PMREM capture with a real
   * shaded one. */
  private rebuildEnvironment(config: Project3DConfig) {
    const scene = this.scene;
    const envScene = this.envScene;
    const pmrem = this.pmrem;
    const skyMesh = this.skyMesh;
    if (!scene || !envScene || !pmrem || !skyMesh) return;

    // Standalone "Sky" tab's off switch (Rozaris-specific — the reference
    // demo has no such toggle, its Sky is always the scene). No physical
    // dome to capture a PMREM of, so fall back to one flat neutral color
    // for both background and (via PMREMGenerator.fromScene on a bare
    // color scene, the cheapest possible capture) ambient environment
    // lighting — everything still lit, just no directional sky gradient.
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
    // The physical sky dome paints itself directly as real geometry, so
    // background stays unset — the renderer draws `skyMesh` itself
    // rather than a flat equirect of it.
    scene.background = null;
    scene.backgroundIntensity = config.environmentIntensity;
    skyMesh.visible = true;
  }

  /** Loads the real vendored LUT file for `presetId` (see `LUT_PRESETS`),
   * dispatching to whichever of `LUTCubeLoader`/`LUT3dlLoader`/
   * `LUTImageLoader` its `format` names — every option
   * webgl_postprocessing_3dlut.html's own reference GUI exposes, same
   * extension-based branch its own source uses. All three loaders share
   * the same `{size, texture3D}` result shape. "Only reload on a real
   * change" shape same as the rest of this class's async loaders (e.g.
   * `loadCausticsTexture`). Failure (bad/missing preset id, fetch error)
   * degrades to "no LUT" rather than breaking the mount. */
  private async loadLut(presetId: string) {
    if (this.lutPresetLoaded === presetId && this.lutTexture) return;
    const preset = LUT_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      this.lutTexture = null;
      this.lutPresetLoaded = null;
      return;
    }
    const token = this.mountToken;
    const loader = preset.format === "cube" ? new LUTCubeLoader() : preset.format === "3dl" ? new LUT3dlLoader() : new LUTImageLoader();
    await new Promise<void>((resolve) => {
      loader.load(
        `/luts/${preset.file}`,
        (result) => {
          if (token !== this.mountToken) return resolve();
          this.lutTexture = result.texture3D;
          this.lutPresetLoaded = presetId;
          resolve();
        },
        undefined,
        (err) => {
          if (token !== this.mountToken) return resolve();
          console.warn(`3D Experience: LUT preset "${presetId}" failed to load, LUT grading disabled`, err);
          this.lutTexture = null;
          this.lutPresetLoaded = null;
          resolve();
        }
      );
    });
  }

  /** Builds (or rebuilds) the TSL post-processing pipeline for the given
   * quality tier. Uses `RenderPipeline` (three.js's current, non-deprecated
   * pipeline/output-node manager) over a plain scene pass. Wrapped in
   * try/catch: a construction failure degrades to "no post-processing"
   * (renderPipeline stays null, the render loop falls back to a plain
   * renderer.render(scene, camera)) rather than breaking the viewer
   * outright.
   *
   * SSR/GTAO removed (user request, 2026-08-13, after they were
   * implicated as a likely contributor to a real Sections-panel
   * instability report — see the "rozaris-3d-sections-audit-fix" and
   * "rozaris-3d-ssr-gtao-reenable" memories for the full history: this
   * exact chain caused two separate, never-fully-explained real-GPU
   * failures earlier this session — a black viewer, then solid red —
   * before being re-enabled with a targeted-but-unconfirmed mitigation.
   * Rather than keep chasing an unverifiable-without-a-browser crash
   * class, the effects themselves (and the MRT normal/metalness/roughness
   * buffers + HDR clamp that only existed to support them) are gone
   * outright — not just toggled off. `ssrEnabled`/`gtaoEnabled` are gone
   * from `Project3DConfig`/the API schema/the DB entirely (see the
   * migration), and `tier.ssr`/`tier.gtao` are gone from
   * `QualityTierSettings` — no dead, do-nothing toggle left behind
   * anywhere. The real geographic sun, ambient light and PMREM sky
   * environment/reflections were never implicated in either failure and
   * are completely untouched by this.
   *
   * Bloom (Sky/Water/Bloom/Clouds "Ocean" tab) — a real per-project
   * toggle (`config.bloomEnabled`), ANDed with `tier.bloom` exactly like
   * `antialiasEnabled` already is against `tier.antialias`. Threshold is
   * fixed at 0.85 (`BLOOM_THRESHOLD_DEFAULT`, webgl_shaders_ocean.html's
   * own Bloom GUI default — it doesn't expose threshold either, only
   * strength/radius).
   *
   * Depth of field (`webgl_postprocessing_dof2.html` parity) — real bokeh
   * blur from `scenePass.getViewZNode()` (works unmodified, no MRT/setMRT
   * needed: `PassNode`'s own default depth texture is always created
   * unless `depthBuffer: false` is explicitly passed to `pass()`, which
   * this app never does). Unlike `motionBlur`, `dof()`'s first argument is
   * internally wrapped in `convertToTexture()` (confirmed in
   * `DepthOfFieldNode.js`), so it accepts the already-composited
   * bloom+chain fine — placed *after* bloom is folded in, so bright bloom
   * highlights blur into proper bokeh discs instead of staying sharp
   * inside a blurred base. */
  private buildRenderPipeline(tier: QualityTierSettings) {
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    this.bloomNode = null;
    this.lutIntensity = null;
    this.dofFocusDistance = null;
    this.dofFocalLength = null;
    this.dofBokehScale = null;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return;
    try {
      const scenePass = pass(scene, camera);
      const color = scenePass.getTextureNode("output");

      let chain: THREE.Node<"vec4"> = color;
      if (tier.bloom && this.config.bloomEnabled) {
        // Sky/Water/Bloom/Clouds "Ocean" tab — strength/radius only,
        // matching webgl_shaders_ocean.html's own Bloom GUI folder
        // exactly; threshold isn't exposed there either, so it stays
        // fixed at the same value the demo hardcodes.
        const bloomNode = bloom(chain, this.config.bloomStrength, this.config.bloomRadius, BLOOM_THRESHOLD_DEFAULT);
        this.bloomNode = bloomNode;
        chain = chain.add(bloomNode);
      }
      // Isolated into its own widened-type variable (same reasoning as
      // aaChain/finalChain below) — DepthOfFieldNode, like SMAANode/
      // Lut3DNode, doesn't structurally satisfy THREE.Node<"vec4"> per
      // tsc, so reusing the narrower `chain` binding here would also break
      // the `chain.add(bloomNode)` call above it.
      let dofChain: typeof chain | ReturnType<typeof dof> = chain;
      if (tier.depthOfField && this.config.depthOfFieldEnabled) {
        // Real auto-focus (see the field doc comment above) — starts at
        // the config's own focalLength as a reasonable pre-first-frame
        // value; the render loop overwrites it every frame from then on.
        const focusDistance = uniform(this.config.depthOfFieldFocalLength);
        const focalLength = uniform(this.config.depthOfFieldFocalLength);
        const bokehScale = uniform(this.config.depthOfFieldBokehScale);
        this.dofFocusDistance = focusDistance;
        this.dofFocalLength = focalLength;
        this.dofBokehScale = bokehScale;
        dofChain = dof(chain, scenePass.getViewZNode(), focusDistance, focalLength, bokehScale);
      }

      const aaChain = tier.antialias && this.config.antialiasEnabled ? smaa(dofChain) : dofChain;

      // 3D LUT (webgl_postprocessing_3dlut.html parity) — applied last,
      // after antialiasing, matching the reference demo's own
      // OutputPass -> LUTPass ordering (color grading is the final step).
      // `this.lutTexture` is only ever non-null when `config.lutEnabled`
      // (mount() clears it otherwise, see loadLut's call site) — checking
      // it directly here (not `config.lutEnabled` again) is what correctly
      // no-ops if the async load hasn't resolved yet or failed.
      let finalChain: typeof aaChain | ReturnType<typeof lut3D> = aaChain;
      if (tier.lut && this.lutTexture) {
        const intensity = uniform(this.config.lutIntensity);
        this.lutIntensity = intensity;
        finalChain = lut3D(aaChain, texture3D(this.lutTexture), this.lutTexture.image.width, intensity);
      }

      // Loading-screen reveal (webgl_postprocessing_transition.html
      // technique) — absolute last step, wrapping the fully-composited
      // image (every other effect above included) so the whole thing
      // wipes in together, not just the raw color. `revealActive` is only
      // ever true for the render(s) right after mount() first has
      // something ready to show — see this method's own field doc
      // comment above for the full lifecycle (set in mount(), ticked and
      // torn back out by the render loop).
      let revealedChain: typeof finalChain | ReturnType<typeof mix> = finalChain;
      if (this.revealActive) {
        const threshold = uniform(0);
        this.revealThreshold = threshold;
        const noise = mx_fractal_noise_float(vec3(uv().mul(6), 0), 3, 2, 0.5);
        const fadeWidth = 0.08;
        const mask = smoothstep(threshold.sub(fadeWidth), threshold, noise);
        // Matches this app's own dark glass-panel chrome color, not an
        // arbitrary black — reads as an intentional loading-shell tone
        // rather than a flash of nothing.
        const placeholder = vec4(tslColor(0x18181b), 1);
        // finalChain's static type is a union including SMAANode/
        // Lut3DNode/DepthOfFieldNode (same "doesn't structurally satisfy
        // NodeExtensions" cosmetic typing gap documented on dofChain/
        // aaChain above — nodeObject() doesn't resolve it either, tried
        // first). mix()'s 3-arg overload needs an exact match on every
        // union member, unlike smaa()/lut3D()'s own single-node params
        // above, which happen to be loose enough to accept the union
        // as-is — an explicit cast here is the least-bad fix: at runtime
        // this really is always a real vec4 color node regardless of
        // which effects happen to be enabled.
        revealedChain = mix(placeholder, finalChain as unknown as THREE.Node<"vec4">, mask);
      } else {
        this.revealThreshold = null;
      }

      const pipeline = new THREE.RenderPipeline(renderer);
      pipeline.outputNode = revealedChain;
      this.renderPipeline = pipeline;
    } catch (err) {
      console.error("3D Experience: post-processing pipeline failed, falling back to direct render", err);
      this.renderPipeline = null;
      this.bloomNode = null;
      this.lutIntensity = null;
      this.dofFocusDistance = null;
      this.dofFocalLength = null;
      this.dofBokehScale = null;
      this.revealThreshold = null;
    }
  }

  /** Builds a fresh `WaterMesh` from the given config — the exact
   * construction `mount()` used to inline; factored out so
   * `setWaterEnabled` (a live toggle, no remount) can build the same mesh
   * on demand. Doesn't add it to the scene or touch `this.waterMesh` —
   * callers own both. */
  private createWaterMesh(config: Project3DConfig): WaterMesh {
    const waterNormals = new THREE.TextureLoader().load("/textures/waternormals.jpg", (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });
    const waterMesh = new WaterMesh(new THREE.PlaneGeometry(WATER_PLANE_SIZE, WATER_PLANE_SIZE), {
      waterNormals,
      sunDirection: this.sunDirection.clone(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: config.waterDistortionScale,
      size: config.waterSize,
    });
    waterMesh.rotation.x = -Math.PI / 2;
    return waterMesh;
  }

  /** Live add/remove of the water plane — see `waterMesh`'s own field doc
   * comment for why this exists (real click-responsiveness bug fix, no
   * longer a mount()-only flag). No-ops if the scene isn't mounted yet, or
   * if the requested state is already current (called unconditionally
   * from `applyLiveUpdate` whenever `waterEnabled` differs from the
   * previous config — this guard just makes the method itself idempotent
   * for any other caller). */
  setWaterEnabled(enabled: boolean, config: Project3DConfig) {
    if (!this.scene) return;
    if (enabled) {
      if (this.waterMesh) return;
      const waterMesh = this.createWaterMesh(config);
      this.scene.add(waterMesh);
      this.waterMesh = waterMesh;
    } else {
      if (!this.waterMesh) return;
      this.scene.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      (this.waterMesh.material as THREE.Material).dispose();
      this.waterMesh = null;
    }
  }

  /** One-time scene setup per project/content-mode/rendering-mode — full
   * teardown+rebuild, called by the component whenever project.id,
   * usingGlb, any slot's glbUrl, config.renderingMode or
   * config.qualityPreset change. Cheaper config tweaks are applied
   * in-place by `applyLiveUpdate`/`applySunAndEnvironment` instead. */
  async mount(container: HTMLDivElement, params: MountParams) {
    const token = ++this.mountToken;
    this.container = container;
    this.setProject(params.project);
    this.config = params.config;
    const { config, detailModels, usingGlb, project } = params;
    this.isEditorPreview = params.isEditorPreview;

    const renderer = new THREE.WebGPURenderer({
      antialias: true,
      // "auto"/"webgpu" both let Three.js probe for WebGPU and fall back
      // to WebGL2 automatically (WebGPURenderer's own built-in
      // `getFallback`); only "webgl2" forces the WebGL2 backend outright.
      forceWebGL: config.renderingMode === "webgl2",
      // Off (matches WebGPURenderer's own default) — the Section cap fill
      // used to need this (a stencil-buffer silhouette technique), briefly
      // made unconditional on 2026-08-14, then removed the same day when
      // that whole technique turned out not to work under this app's
      // WebGPURenderer (see `sectionFillMeshes`'s own doc comment) and was
      // replaced with a back-face render that needs no stencil buffer at
      // all. Nothing else in this app uses stencil.
      stencil: false,
      // webgpu_camera_logarithmicdepthbuffer.html parity — reduces
      // z-fighting at distance against this app's fixed far=2000 camera
      // (see the PerspectiveCamera constructed below). Off by default,
      // matches WebGPURenderer's own default; another renderer-
      // construction-time flag, same "needs a fresh mount" category as
      // `stencil`/`forceWebGL` above.
      logarithmicDepthBuffer: config.logarithmicDepthEnabled,
    });
    try {
      await renderer.init();
    } catch {
      if (token === this.mountToken) this.callbacks.onWebglFail(this.callbacks.t("map.noWebglShort"));
      return;
    }
    if (token !== this.mountToken) {
      renderer.dispose();
      return;
    }

    const tier = QUALITY_TIERS[config.qualityPreset];
    // Fresh setup (new project/GLB/rendering-mode) resets any runtime
    // adaptive downgrade from a prior mount back to Admin's real tier.
    this.effectiveTier = tier;
    this.frameTimes = [];
    this.downgradeStep = 0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap));
    renderer.setSize(container.clientWidth * tier.renderScale, container.clientHeight * tier.renderScale, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.shadowMap.enabled = config.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.exposure;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    // Sections module — see this.clippingGroup's field doc comment. Every
    // "clippable" object gets added to this group instead of `scene`
    // directly, further below; sun/ambient/lights and section-editing
    // chrome stay direct children of `scene`.
    const clippingGroup = new THREE.ClippingGroup();
    // Real click-freeze bug fix (2026-08-14) — starts life at the same
    // fixed 6-plane "nothing active" state `applyActiveClipping` always
    // uses from here on (see NO_ACTIVE_SECTION_PLANES's own doc comment
    // in sections.ts), instead of `ClippingGroup`'s own default (an empty
    // array). Whatever pipeline variant the very first rendered frame
    // needs for this group's meshes, every later on/off/switch-section
    // action reuses unchanged — there's no separate "default" length for
    // the first real activation to differ from and force a second compile
    // against.
    clippingGroup.clippingPlanes = NO_ACTIVE_SECTION_PLANES;
    scene.add(clippingGroup);
    this.clippingGroup = clippingGroup;
    const sectionHelperGroup = new THREE.Group();
    sectionHelperGroup.name = "RZ_SectionHelpers";
    scene.add(sectionHelperGroup);
    this.sectionHelperGroup = sectionHelperGroup;

    const envScene = new THREE.Scene();
    this.envScene = envScene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem = pmrem;

    const isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
    const fov = isMobileViewport ? config.cameraFovMobile : config.cameraFovDesktop;
    const camera = new THREE.PerspectiveCamera(fov, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 2000);
    this.camera = camera;

    // Real sun — see src/lib/sunPosition.ts. Direction only; distance is
    // arbitrary for a DirectionalLight, scaled by boundingRadius once
    // known below. Shadow bias/normalBias are scaled to boundingRadius
    // too, not left as fixed absolute values.
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.castShadow = config.shadowsEnabled;
    sun.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
    // webgl_watch.html parity — real PCF soft-shadow-edge blur (in shadow
    // map texels). Only visible because renderer.shadowMap.type is already
    // PCFSoftShadowMap (set below) — that's the one shadow map type this
    // property actually affects (confirmed against three.js's own
    // DirectionalLightShadow/WebGPU shadow-node source). 0 (default)
    // matches today's hard edge exactly.
    sun.shadow.radius = config.shadowSoftness;
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(sun, sun.target, ambient);
    this.sun = sun;
    this.ambient = ambient;

    // Physical sky dome (Sky/Water/Bloom/Clouds "Ocean" tab) — the
    // scene's only backdrop; its turbidity/rayleigh/mie/cloud/sunPosition
    // uniforms are handled by rebuildEnvironment/applySunAndEnvironment,
    // not here.
    const skyMesh = new SkyMesh();
    skyMesh.scale.setScalar(SKY_DOME_SCALE);
    scene.add(skyMesh);
    this.skyMesh = skyMesh;

    // Optional water plane (WaterMesh) — only built when
    // config.waterEnabled (per-project opt-in; most projects have none).
    // Mount-time construction here is still real (this is what a fresh
    // mount/project-switch needs), but toggling it live no longer forces
    // one — see `setWaterEnabled`'s own doc comment for the 2026-08-14
    // click-freeze fix that moved live on/off out of this path. Auto-
    // sized/positioned like
    // WATER_PLANE_SIZE's doc comment). The normals texture is the actual
    // asset the reference demo loads (`textures/waternormals.jpg`),
    // vendored into `public/textures/` rather than re-approximated with a
    // procedural canvas gradient — this is exactly the kind of hand-
    // authored tiling detail a gradient can't reproduce.
    if (config.waterEnabled) {
      const waterMesh = this.createWaterMesh(config);
      scene.add(waterMesh);
      this.waterMesh = waterMesh;
    } else {
      this.waterMesh = null;
    }

    this.pickable = new Map();
    this.unitMeshes = new Map();
    this.glbUnitBoxes = new Map();
    this.unitMaterialCache = new Map();

    let boundingRadius = 20;
    let centerX = 0;
    let centerY = 1;
    let centerZ = 0;

    if (usingGlb) {
      // --- GLB content — one root per enabled detail-model slot
      // (Multiple Detail-Model Slots pass). Loaded in parallel; a single
      // slot's GLB failing to load doesn't abort the others — that's the
      // whole point of independent slots (fix/replace one without
      // touching the other) — only if EVERY enabled slot fails does this
      // fall back to procedural massing, same as the old single-model
      // failure behavior. ---
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
      this.dracoLoader = dracoLoader;
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      const enabledModels = detailModels.filter((d) => d.model.enabled && d.model.glbUrl);
      const loaded = await Promise.all(
        enabledModels.map(async ({ slotId, model }) => {
          try {
            const gltf = await loader.loadAsync(model.glbUrl);
            return { slotId, model, root: gltf.scene };
          } catch (err) {
            // Failure recovery: a bad URL/network error/corrupt file used
            // to dead-end the whole mount in the same "no WebGL" error
            // screen a genuine renderer failure shows — misleading, and
            // worse than necessary. This slot is just skipped; the
            // others (and the public/editor callers's own per-slot
            // upload UI) are unaffected.
            console.warn(`3D Experience: detail GLB failed to load for slot ${slotId}, skipping it`, err);
            return null;
          }
        })
      );
      if (token !== this.mountToken) return;
      const successful = loaded.filter((l): l is { slotId: string; model: ProjectDetailModel; root: THREE.Group } => l !== null);

      if (successful.length === 0) {
        if (token === this.mountToken) this.callbacks.onGlbLoadFailed();
        return;
      }

      const unionBox = new THREE.Box3();
      for (const { slotId, model, root } of successful) {
        this.applyDetailTransform(root, model.scale, model.rotationDeg, model.altitudeOffset);
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        clippingGroup.add(root);
        this.glbRoots.set(slotId, root);

        this.applyDetailUnitLinks(slotId, root, model.unitLinks as UnitMeshLink[]);
        this.applyGlassPreset(root, config.glassPreset, config.environmentIntensity);
        this.applyNodeOverrides(root, model);

        unionBox.union(new THREE.Box3().setFromObject(root));
      }

      const size = unionBox.getSize(new THREE.Vector3());
      const center = unionBox.getCenter(new THREE.Vector3());
      boundingRadius = Math.max(size.x, size.y, size.z) * 0.65 || 20;
      // A real uploaded GLB is very often authored off-origin (real-world
      // survey coordinates, arbitrary export origin, etc.) — using the
      // union bounding box's real center here (not a hardcoded (0, y, 0))
      // keeps the orbit pivot/shadow target locked to the actual
      // building(s), across every loaded slot.
      centerX = center.x;
      centerY = center.y;
      centerZ = center.z;

      this.disposeGeometry = () => {
        for (const root of this.glbRoots.values()) {
          clippingGroup.remove(root);
          disposeGlbObject3D(root);
        }
      };
    } else {
      // --- Procedural massing fallback ---
      const layout = computeProjectLayout(project);
      this.unitBoxes = layout.units;
      boundingRadius = layout.boundingRadius;
      centerY = layout.centerY;

      // Ground Platform (Sky/Water/Bloom/Clouds follow-up) — built once,
      // in both content modes, after `boundingRadius` is finalized below;
      // see that shared block for why it moved out of this branch.

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      // Unit-status caustics — real texture + shared scale/speed uniforms
      // loaded/created once here, not once per unit (see caustics.ts's own
      // doc comment for the full technique). `causticsUnitUniforms` is
      // rebuilt fresh every mount, same lifecycle as `unitMeshes` itself.
      const causticsActive = tier.caustics && config.causticsEnabled;
      this.causticsUnitUniforms = new Map();
      if (causticsActive) {
        this.causticsTexture = loadCausticsTexture();
        this.causticsScaleUniform = uniform(config.causticsScale);
        this.causticsSpeedUniform = uniform(config.causticsSpeed);
      } else {
        this.causticsTexture = null;
        this.causticsScaleUniform = null;
        this.causticsSpeedUniform = null;
      }
      for (const unitBox of layout.units) {
        // Initial seed color for the very first frame — refreshAppearance
        // (called right after mount by every real caller) immediately
        // overwrites this via applyUnitAppearance/resolveUnitColors, but
        // seeding it correctly avoids a one-frame flash of the wrong
        // color on projects with custom status colors.
        const seedColor = this.resolveUnitColors()[unitBox.unit.status] ?? this.resolveUnitColors().available;
        let material: THREE.MeshStandardMaterial = new THREE.MeshStandardMaterial({
          color: seedColor,
          roughness: 0.6,
          metalness: 0.05,
        });
        if (causticsActive && this.causticsTexture && this.causticsScaleUniform && this.causticsSpeedUniform) {
          // Real NodeMaterial upgrade — `.emissiveNode` (unlike `.color`/
          // `.roughness`/`.metalness`/`.emissive`/`.emissiveIntensity`,
          // which MeshStandardNodeMaterial still exposes for classic-API
          // compatibility, confirmed against its own source) only exists
          // on NodeMaterial subclasses, not the plain MeshStandardMaterial
          // just constructed above. Same upgrade pattern applyNodeOverrides
          // already uses for clearcoat/iridescence.
          const nodeMaterial = new THREE.MeshStandardNodeMaterial({
            color: seedColor,
            roughness: 0.6,
            metalness: 0.05,
          });
          material.dispose();
          const initialIntensity = this.resolveCausticsIntensity(unitBox.unit.status);
          const { emissiveNode, uniforms } = buildCausticsUnitEmissiveNode(
            this.causticsTexture,
            this.causticsScaleUniform,
            this.causticsSpeedUniform,
            seedColor,
            initialIntensity
          );
          nodeMaterial.emissiveNode = emissiveNode;
          this.causticsUnitUniforms.set(unitBox.unit.id, uniforms);
          material = nodeMaterial as unknown as THREE.MeshStandardMaterial;
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(unitBox.width, unitBox.height, unitBox.depth);
        mesh.position.set(unitBox.x, unitBox.y, unitBox.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.unitId = unitBox.unit.id;
        clippingGroup.add(mesh);
        this.unitMeshes.set(unitBox.unit.id, mesh);
        this.pickable.set(unitBox.unit.id, mesh);
      }

      this.disposeGeometry = () => {
        geometry.dispose();
        this.unitMeshes.forEach((mesh) => (mesh.material as THREE.Material).dispose());
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.geometry !== geometry) obj.geometry.dispose();
        });
      };
    }
    if (token !== this.mountToken) return;

    const target = new THREE.Vector3(centerX, centerY, centerZ);
    const startDistance = boundingRadius * config.cameraStartDistanceMultiplier;
    camera.position.set(centerX + startDistance * 0.6, centerY + startDistance * 0.55, centerZ + startDistance * 0.9);
    camera.lookAt(target);
    this.defaultCamera = { position: camera.position.clone(), target: target.clone(), fov: camera.fov };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = boundingRadius * config.cameraMinDistanceMultiplier;
    controls.maxDistance = boundingRadius * config.cameraMaxDistanceMultiplier;
    controls.minPolarAngle = THREE.MathUtils.degToRad(config.cameraMinPolarDeg);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
    controls.autoRotate = config.autoRotate;
    controls.autoRotateSpeed = 0.6;
    controls.update();
    this.controls = controls;

    // Bias scaled to boundingRadius, not a fixed absolute value — a fixed
    // bias is negligible against a real building tens/hundreds of meters
    // across (shadow acne — "faces hiding and reappearing"), even though
    // it was fine for the procedural fallback's small, uniform units.
    sun.shadow.bias = -0.00005 * boundingRadius;
    sun.shadow.normalBias = 0.01 * boundingRadius;
    // Real bug fix (see `sunDistance`'s own field doc comment) — near/far
    // must bracket where the sun *actually* sits (`sunDistance` units from
    // `target`, applySunAndEnvironment's own placement), not just scale
    // off boundingRadius in isolation. `sunDistance` itself also scales
    // with boundingRadius (floor of 200, same distance every project used
    // before this fix, so a project already comfortably inside that floor
    // is unaffected) so both stay proportional across tiny-to-huge
    // projects instead of drifting apart the way the old fixed-200/
    // boundingRadius*6 pair could.
    const sunDistance = Math.max(200, boundingRadius * 3);
    this.sunDistance = sunDistance;
    sun.shadow.camera.near = Math.max(0.1, sunDistance - boundingRadius * 2);
    sun.shadow.camera.far = sunDistance + boundingRadius * 2;
    const shadowSpan = boundingRadius * 1.5;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.copy(target);
    this.sceneCenter = target.clone();

    // Ground Platform (Sky/Water/Bloom/Clouds follow-up) — unified across
    // both content modes. "disc" (the original ground, sized off
    // `boundingRadius`) stays procedural-mode-only exactly as before
    // (`usingGlb` guard below) — a GLB project only ever gets a ground
    // when explicitly switched to "infinite", so no existing GLB project
    // gains an unrequested ground the moment this field exists.
    // `groundEnabled` still just toggles `.visible` on an
    // always-constructed mesh (unchanged pattern) so it stays a cheap
    // live toggle, not a remount — only `groundStyle` itself (a real
    // geometry swap) needs one, see ProceduralProjectViewer.tsx's mount
    // effect deps.
    const groundGeometry =
      config.groundStyle === "infinite"
        ? new THREE.PlaneGeometry(GROUND_INFINITE_SIZE, GROUND_INFINITE_SIZE)
        : usingGlb
          ? null
          : new THREE.CircleGeometry(boundingRadius * 1.6, 48);
    if (groundGeometry) {
      const ground = new THREE.Mesh(groundGeometry, this.buildGroundMaterial(config));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      ground.visible = config.groundEnabled;
      clippingGroup.add(ground);
      this.ground = ground;
    } else {
      this.ground = null;
    }

    scene.fog = config.fogEnabled ? new THREE.FogExp2(this.resolveFogColor(config), config.fogDensity) : null;

    this.rebuildEnvironment(config);
    // 3D LUT — real async texture load, awaited before buildRenderPipeline
    // reads `this.lutTexture` below (both `lutEnabled` and `lutPreset` are
    // mount deps — see ProceduralProjectViewer.tsx — so this only ever
    // runs on a fresh mount; same mountToken guard pattern as this
    // class's other async loaders.
    if (config.lutEnabled) {
      await this.loadLut(config.lutPreset);
    } else {
      this.lutTexture = null;
      this.lutPresetLoaded = null;
    }
    if (token !== this.mountToken) return;
    // Loading-screen reveal — armed before this same buildRenderPipeline
    // call so the very first frame the render loop below ever draws is
    // already the fully-hidden (threshold 0) state, not one frame of the
    // finished, unrevealed image flashing first. Real per-project on/off
    // (config.loadingRevealEnabled) — when off, buildRenderPipeline's own
    // `if (this.revealActive)` check is simply never true, so no reveal
    // node is ever added to the chain at all (same "no dead toggle"
    // pattern as every other Enabled flag this session).
    this.revealActive = config.loadingRevealEnabled;
    this.revealStartTime = performance.now();
    this.buildRenderPipeline(this.effectiveTier);

    this.callbacks.onReady(true);
    this.callbacks.onWebglFail(null);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    // Three.js's Raycaster doesn't skip invisible objects on its own
    // (Mesh.raycast never checks `.visible`) — filtering the *input* list
    // (rather than the hits) is what actually keeps a filtered-out/
    // unlinked unit from being clickable.
    const pickableList = () => Array.from(this.pickable.values()).filter((obj) => obj.visible);

    function pointerFromEvent(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    const pickUnitId = (e: PointerEvent): string | null => {
      pointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickableList(), true);
      if (hits.length === 0) return null;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj) {
        if (typeof obj.userData.unitId === "string") return obj.userData.unitId;
        obj = obj.parent;
      }
      return null;
    };

    const handleMove = (e: PointerEvent) => {
      // Sections module — suppress unit hover while drawing a section
      // rectangle or dragging its gizmo, so the two interaction systems
      // never fight over the same pointer events.
      if (this.drawSection || this.sectionGizmo?.dragging) return;
      // Interaction toggles (full-configurator pass) — `viewerUI` is a
      // nullable Json? column and every pre-existing row predates these
      // keys, so a missing key defaults to `true` (today's hardcoded
      // always-on behavior), same pattern as the other viewerUI toggles.
      if (this.config?.viewerUI.hoverEnabled === false) return;
      const nextHoverId = pickUnitId(e);
      if (nextHoverId !== this.hoveredId) {
        this.hoveredId = nextHoverId;
        this.refreshAppearanceInternal();
        renderer.domElement.style.cursor = nextHoverId ? "pointer" : "grab";
        const unit = nextHoverId ? this.unitById.get(nextHoverId) ?? null : null;
        this.callbacks.onHoverChange(unit);
      }
      // Tracked on every move, not just id changes, and reported via the
      // separate onPointerMove callback (not React state) — see its doc
      // comment for why.
      if (nextHoverId) this.callbacks.onPointerMove(e.clientX, e.clientY);
    };
    const handleClick = (e: PointerEvent) => {
      if (this.drawSection || this.sectionGizmo?.dragging) return;
      if (this.config?.viewerUI.selectEnabled === false) return;
      const unitId = pickUnitId(e);
      if (!unitId) return;
      const unit = this.unitById.get(unitId);
      if (unit) this.callbacks.onSelectUnit?.(unit);
    };
    const handleLeave = () => {
      // Without this, moving the mouse off the canvas edge mid-hover
      // leaves the cursor/tooltip/highlight stuck on whatever unit was
      // last under the pointer — pointermove simply stops firing once the
      // pointer leaves this element.
      if (this.hoveredId !== null) {
        this.hoveredId = null;
        this.refreshAppearanceInternal();
      }
      renderer.domElement.style.cursor = "grab";
      this.callbacks.onHoverChange(null);
    };
    this.handleMove = handleMove;
    this.handleClick = handleClick;
    this.handleLeave = handleLeave;

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointermove", handleMove);
    renderer.domElement.addEventListener("click", handleClick);
    renderer.domElement.addEventListener("pointerleave", handleLeave);

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      const nextIsMobile = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
      camera.fov = nextIsMobile ? this.config.cameraFovMobile : this.config.cameraFovDesktop;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      const t = QUALITY_TIERS[this.config.qualityPreset];
      renderer.setSize(container.clientWidth * t.renderScale, container.clientHeight * t.renderScale, false);
      // Shadow-map debug HUD positions itself in window-pixel terms
      // internally (see its own field doc comment) — needs to know
      // whenever the window (not just this container) resizes too.
      this.shadowMapViewer?.updateForWindowResize();
    });
    resizeObserver.observe(container);
    this.resizeObserver = resizeObserver;

    const sampleAdaptiveQuality = (now: number) => {
      const last = this.lastFrameAt;
      this.lastFrameAt = now;
      if (last == null) return;
      const frames = this.frameTimes;
      frames.push(now - last);
      if (frames.length > 90) frames.shift();
      // Wait for a full window before judging, and stop once every
      // downgrade step has already been used — nothing left to try.
      if (frames.length < 60 || this.downgradeStep >= ADAPTIVE_DOWNGRADE_ORDER.length) return;
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      if (avg <= 33) return; // healthy (roughly >=30fps sustained)
      const flag = ADAPTIVE_DOWNGRADE_ORDER[this.downgradeStep];
      this.effectiveTier = { ...this.effectiveTier, [flag]: false };
      this.downgradeStep += 1;
      this.frameTimes = []; // fresh window before judging the next step
      console.info(`3D Experience: sustained low frame rate (~${avg.toFixed(0)}ms/frame) — disabling "${flag}" to recover`);
      this.buildRenderPipeline(this.effectiveTier);
    };

    const stepCameraTransition = (now: number) => {
      const t = this.cameraTransition;
      if (!t) return;
      const elapsed = now - t.startTime;
      const p = Math.min(1, elapsed / t.durationMs);
      const eased = p * p * (3 - 2 * p); // smoothstep — no visible "teleport"
      camera.position.lerpVectors(t.startPos, t.endPos, eased);
      controls.target.lerpVectors(t.startTarget, t.endTarget, eased);
      camera.fov = t.startFov + (t.endFov - t.startFov) * eased;
      camera.updateProjectionMatrix();
      if (p >= 1) this.cameraTransition = null;
    };

    // A user grabbing the view mid-transition should win immediately, not
    // fight the animation for the remaining duration.
    controls.addEventListener("start", () => {
      this.cameraTransition = null;
    });

    const samplePerfStats = () => {
      if (!this.showPerfStats) return;
      // Every ~30 frames (roughly twice a second at 60fps, slower on a
      // struggling device) rather than a fixed setTimeout, so this never
      // fights the adaptive-quality sampler's own timing.
      this.perfSampleCounter += 1;
      if (this.perfSampleCounter % 30 !== 0) return;
      const frames = this.frameTimes;
      const avgFrameMs = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
      this.callbacks.onPerfStats({
        fps: avgFrameMs > 0 ? Math.round(1000 / avgFrameMs) : 0,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        dpr: renderer.getPixelRatio(),
      });
    };

    this.refreshAppearance({
      project,
      config,
      usingGlb,
      selectedUnitId: params.selectedUnitId,
      filters: params.filters,
      showUnitBoxes: params.showUnitBoxes,
    });
    await renderer.setAnimationLoop(() => {
      const now = performance.now();
      sampleAdaptiveQuality(now);
      // controls.update() must run BEFORE stepCameraTransition, not after
      // — OrbitControls.update() reads camera.position/controls.target
      // fresh each call and, when autoRotate is on, unconditionally nudges
      // them further. stepCameraTransition's lerp is computed from fixed
      // start/end snapshots, so putting it last makes it the authoritative
      // final write for the frame — otherwise the nudge silently overwrote
      // the transition's intended position every frame, fighting the
      // "never visibly teleport" smoothstep with a slow drift.
      controls.update();
      stepCameraTransition(now);
      // Depth of field real auto-focus — recomputed every frame from the
      // camera's real live distance to its orbit target, after
      // stepCameraTransition (the frame's authoritative final camera
      // write, see the comment above) so a preset transition's focus
      // stays correct mid-flight too, not just once it settles.
      if (this.dofFocusDistance) {
        this.dofFocusDistance.value = camera.position.distanceTo(controls.target);
      }
      // Loading-screen reveal — ticked every frame while active; once the
      // ~1.1s window elapses, rebuilds the pipeline once more without the
      // reveal node (see buildRenderPipeline's own doc comment) so it's a
      // one-time cost, not a permanent one on every frame after mount.
      // 1.15 (not 1.0) overshoots the noise's ~[0,1] range on purpose —
      // smoothstep's own fadeWidth needs the threshold to clear the
      // noise's highest values too, or a few pixels would stay dimmed
      // forever at progress=1.
      if (this.revealActive && this.revealThreshold) {
        const revealDurationMs = 1100;
        const progress = Math.min(1, (now - this.revealStartTime) / revealDurationMs);
        this.revealThreshold.value = progress * 1.15;
        if (progress >= 1) {
          this.revealActive = false;
          this.buildRenderPipeline(this.effectiveTier);
        }
      }
      if (this.renderPipeline) this.renderPipeline.render();
      else renderer.render(scene, camera);
      // Shadow-map debug HUD — drawn as an overlay after the main render
      // (its own .render() call temporarily sets renderer.autoClear=false
      // so it composites on top instead of erasing the frame just drawn).
      // Lazily constructed the first frame the sun's real shadow map
      // actually exists (see this.shadowMapViewer's own field doc comment
      // for why it can't be built any earlier).
      if (this.shadowMapViewerEnabled && this.sun?.shadow.map) {
        if (!this.shadowMapViewer) {
          this.shadowMapViewer = new ShadowMapViewer(this.sun);
          this.shadowMapViewer.size.set(160, 160);
          this.shadowMapViewer.updateForWindowResize();
        }
        this.shadowMapViewer.render(renderer);
      }
      samplePerfStats();
    });
  }

  /** Re-runs refreshAppearance with whatever params it was last called
   * with — used by the pointer handlers, which don't have a fresh
   * `RefreshAppearanceParams` of their own (the component doesn't re-mount
   * the engine on every hover). Keeps the last-known filter/selection
   * state on the instance for this purpose. */
  private lastRefreshParams: RefreshAppearanceParams | null = null;
  private refreshAppearanceInternal() {
    if (this.lastRefreshParams) this.refreshAppearance(this.lastRefreshParams);
  }

  dispose() {
    this.mountToken++; // invalidates any in-flight mount() continuations
    if (this.environmentRebuildTimer != null) {
      clearTimeout(this.environmentRebuildTimer);
      this.environmentRebuildTimer = null;
    }
    const renderer = this.renderer;
    const container = this.container;
    if (renderer) {
      renderer.setAnimationLoop(null);
      if (this.handleMove) renderer.domElement.removeEventListener("pointermove", this.handleMove);
      if (this.handleClick) renderer.domElement.removeEventListener("click", this.handleClick);
      if (this.handleLeave) renderer.domElement.removeEventListener("pointerleave", this.handleLeave);
    }
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    // Sections module — draw-mode listeners, gizmo, cap material/geometry.
    // `sectionHelperGroup`/`clippingGroup` themselves are children of
    // `scene`, disposed of implicitly when `scene` is discarded below (no
    // GPU resources of their own — plain Object3D/Group).
    this.cancelDrawSection();
    this.detachSectionGizmo();
    this.sectionIndicatorMaterial?.dispose();
    this.sectionIndicatorMaterial = null;
    this.sectionIndicatorMesh = null;
    this.sectionFillMaterial?.dispose();
    this.sectionFillMaterial = null;
    this.clearSectionFillMeshes();
    // Plain `ClippingGroup`s (Group subclass) — no GPU resources of their
    // own, same as `sectionHelperGroup`/`clippingGroup` right below;
    // discarded along with the scene, just null the references.
    this.sectionFillClippingGroup = null;
    this.clippingGroup = null;
    this.sectionHelperGroup = null;
    this.liveSection = null;
    this.activeSectionId = null;
    this.disposeGeometry?.();
    this.dracoLoader?.dispose();
    this.envRenderTarget?.dispose();
    this.pmrem?.dispose();
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    // Sky/Water/Bloom/Clouds "Ocean" tab — bloomNode owns its own internal
    // blur/composite render targets (see BloomNode.js's own dispose());
    // holding a direct reference here disposes them explicitly rather than
    // relying on renderPipeline's teardown to reach into the node graph.
    this.bloomNode?.dispose();
    this.bloomNode = null;
    // 3D LUT — the real Data3DTexture holds actual GPU-uploadable pixel
    // data, so it gets an explicit dispose().
    this.lutTexture?.dispose();
    this.lutTexture = null;
    this.lutPresetLoaded = null;
    this.lutIntensity = null;
    // Depth of field — plain UniformNodes, no GPU resources of their own.
    this.dofFocusDistance = null;
    this.dofFocalLength = null;
    this.dofBokehScale = null;
    // Loading-screen reveal — plain UniformNode, no GPU resources of its
    // own; `revealActive` reset too so a disposed-then-remounted engine
    // instance doesn't inherit a stale in-progress reveal state.
    this.revealThreshold = null;
    this.revealActive = false;
    if (this.skyMesh) {
      this.skyMesh.geometry.dispose();
      (this.skyMesh.material as THREE.Material).dispose();
      this.skyMesh = null;
    }
    if (this.waterMesh) {
      const waterNormalsTexture = this.waterMesh.waterNormals.value as THREE.Texture | null;
      waterNormalsTexture?.dispose();
      this.waterMesh.geometry.dispose();
      (this.waterMesh.material as THREE.Material).dispose();
      this.waterMesh = null;
    }
    // Shadow-map debug HUD — no owned GPU resources (see its own field
    // doc comment), just drop the reference.
    this.shadowMapViewer = null;
    this.shadowMapViewerEnabled = false;
    // Unit-status caustics — the real texture holds actual GPU-uploadable
    // pixel data, disposed explicitly same as lutTexture above; per-unit
    // materials/their emissiveNode graphs are disposed along with the
    // rest of unitMeshes elsewhere in this method already.
    this.causticsTexture?.dispose();
    this.causticsTexture = null;
    this.causticsScaleUniform = null;
    this.causticsSpeedUniform = null;
    this.causticsUnitUniforms.clear();
    // Ground Platform — centrally built/disposed now regardless of
    // content mode (see mount()'s unified ground block); the geometry
    // double-dispose this can overlap with in procedural mode (that
    // branch's own `disposeGeometry` traversal above already caught
    // `ground`'s geometry too, generically) is a documented no-op in
    // three.js, not a bug.
    if (this.ground) {
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
      this.ground = null;
    }
    this.groundColorUniform = null;
    this.groundFogColorUniform = null;
    this.groundFogRadiusUniform = null;
    this.groundFogStrengthUniform = null;
    this.cameraTransition = null;
    this.unitMaterialCache.forEach((material) => material.dispose());
    this.unitMaterialCache = new Map();
    // Memory/disposal symmetry — a project switch tears down and re-mounts;
    // without resetting these too, the next project's fresh session would
    // inherit a stale adaptive-downgrade step and frame-time window from
    // whatever the previous project's runtime conditions happened to leave
    // behind.
    this.frameTimes = [];
    this.lastFrameAt = null;
    this.downgradeStep = 0;
    if (renderer) {
      renderer.dispose();
      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    }
    this.renderer = null;
    this.scene = null;
    this.envScene = null;
    this.pmrem = null;
    this.envRenderTarget = null;
    this.controls = null;
    this.glbRoots.clear();
    this.unitMeshes.clear();
    this.glbUnitBoxes.clear();
    this.pickable.clear();
    this.resizeObserver = null;
    this.handleMove = null;
    this.handleClick = null;
    this.handleLeave = null;
    this.disposeGeometry = null;
    this.dracoLoader = null;
    this.container = null;
    this.lastRefreshParams = null;
    this.callbacks.onReady(false);
  }

  /** Applies lower-cost config changes without a full rebuild: ground/
   * shell visibility, camera limits/FOV, detail-model transform/links/
   * glass/material/overrides, exposure — everything the component's
   * "lower-cost config changes" effect used to do inline. Only meaningful
   * once `ready` (mount() has completed) — the caller gates on that, same
   * as the original effect did. */
  applyLiveUpdate(params: LiveUpdateParams) {
    // Captured before `this.config` is overwritten below — the only way
    // to tell an *enabled* flag actually flipped (vs. this call firing for
    // an unrelated field) so the two structural-but-cheap toggles right
    // below only do real work when they need to. Always a real config
    // (the constructor seeds `this.config`, same as `mount()` does), never
    // null — the first-ever call just diffs against that initial value,
    // which is harmless since it's always in sync with what's on screen.
    const prevConfig = this.config;
    this.setProject(params.project);
    this.config = params.config;
    const { project, config, detailModels, usingGlb } = params;

    if (this.ground) this.ground.visible = config.groundEnabled;
    // scene.fog is a plain, stable three.js API — cheap to update live
    // (unlike the post-processing chain), no remount needed.
    if (this.scene) {
      this.scene.fog = config.fogEnabled ? new THREE.FogExp2(this.resolveFogColor(config), config.fogDensity) : null;
    }
    if (this.controls) {
      const layout = usingGlb ? null : computeProjectLayout(project);
      const boundingRadius = layout?.boundingRadius ?? this.controls.getDistance();
      this.controls.minDistance = boundingRadius * config.cameraMinDistanceMultiplier;
      this.controls.maxDistance = boundingRadius * config.cameraMaxDistanceMultiplier;
      this.controls.minPolarAngle = THREE.MathUtils.degToRad(config.cameraMinPolarDeg);
      this.controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
      this.controls.autoRotate = config.autoRotate;
    }
    if (this.camera) {
      const nextIsMobile = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
      this.camera.fov = nextIsMobile ? config.cameraFovMobile : config.cameraFovDesktop;
      this.camera.updateProjectionMatrix();
    }
    // Live-reflects Admin's scale/rotation/altitude sliders and Link Units
    // edits without a full GLB reload — one pass per already-loaded slot.
    // A slot present in `detailModels` but not (yet) in `this.glbRoots`
    // (e.g. just enabled, GLB not loaded until the next full mount()) is
    // simply skipped here, same as the single-model version's implicit
    // "only if a root is already loaded" gate.
    for (const { slotId, model } of detailModels) {
      const root = this.glbRoots.get(slotId);
      if (!root) continue;
      this.applyDetailTransform(root, model.scale, model.rotationDeg, model.altitudeOffset);
      this.applyDetailUnitLinks(slotId, root, model.unitLinks as UnitMeshLink[]);
      this.applyGlassPreset(root, config.glassPreset, config.environmentIntensity);
      this.applyNodeOverrides(root, model);
    }
    if (this.renderer) this.renderer.toneMappingExposure = config.exposure;

    // Sky/Water/Bloom/Clouds pass — wave-look and bloom-look sliders are
    // real live `UniformNode<float>`s on the already-constructed
    // waterMesh/bloomNode, so these drag live with no pipeline rebuild.
    // `waterEnabled` itself used to also force a full engine remount
    // (real click-responsiveness bug, see `waterMesh`'s own field doc
    // comment) — `setWaterEnabled` below is the fix, only called when the
    // flag actually changed so a plain distortion/size drag stays a no-op
    // here as before.
    if (config.waterEnabled !== prevConfig.waterEnabled) {
      this.setWaterEnabled(config.waterEnabled, config);
    }
    if (this.waterMesh) {
      this.waterMesh.distortionScale.value = config.waterDistortionScale;
      this.waterMesh.size.value = config.waterSize;
    }
    // Same fix, same reasoning, for `bloomEnabled`/`depthOfFieldEnabled`:
    // both only ever changed *which nodes* `buildRenderPipeline` chains
    // together, a plain in-memory TSL graph rebuild with no renderer/
    // context/GLB work in it (see that method's own doc comment) — there
    // was never a real reason either needed a full mount(). One rebuild
    // covers both if they changed together (e.g. a preset switch).
    if (config.bloomEnabled !== prevConfig.bloomEnabled || config.depthOfFieldEnabled !== prevConfig.depthOfFieldEnabled) {
      this.buildRenderPipeline(this.effectiveTier);
    }
    if (this.bloomNode) {
      this.bloomNode.strength.value = config.bloomStrength;
      this.bloomNode.radius.value = config.bloomRadius;
    }
    // 3D LUT intensity — real live UniformNode; `lutEnabled`/`lutPreset`
    // still need a fresh mount (structural + a real async texture load,
    // unlike water/bloom/DoF above which are pure in-memory rebuilds).
    if (this.lutIntensity) {
      this.lutIntensity.value = config.lutIntensity;
    }
    // Depth of field's own live uniforms — `dofFocusDistance` is
    // intentionally NOT touched here, it's owned by the per-frame render
    // loop instead (real auto-focus, see its field doc comment).
    if (this.dofFocalLength) {
      this.dofFocalLength.value = config.depthOfFieldFocalLength;
    }
    if (this.dofBokehScale) {
      this.dofBokehScale.value = config.depthOfFieldBokehScale;
    }
    // Unit-status caustics — real shared live UniformNodes (scale/speed);
    // per-unit color/intensity are updated by applyUnitAppearance instead
    // (they depend on each unit's own status, not just global config).
    // `causticsEnabled` itself still needs a fresh mount (structural).
    if (this.causticsScaleUniform) {
      this.causticsScaleUniform.value = config.causticsScale;
    }
    if (this.causticsSpeedUniform) {
      this.causticsSpeedUniform.value = config.causticsSpeed;
    }

    // Ground Platform's ground fog — same live-`UniformNode` pattern as
    // above; `groundFogEnabled` itself is included here (not the mount
    // deps) since it's just `groundFogStrengthUniform` going 0↔1, not a
    // structural change (see buildGroundMaterial's own doc comment).
    if (this.groundColorUniform) this.groundColorUniform.value.set(config.groundColor);
    if (this.groundFogColorUniform) this.groundFogColorUniform.value.set(this.resolveFogColor(config));
    if (this.groundFogRadiusUniform) this.groundFogRadiusUniform.value = Math.max(1, config.groundFogRadius);
    if (this.groundFogStrengthUniform) this.groundFogStrengthUniform.value = config.groundFogEnabled ? 1 : 0;

    // Sections module — re-applies the currently active section's
    // clipping/cap from the freshest `config.sections` (e.g. a numeric
    // field edit in `SectionsPanel`, or a "dragend" commit that just
    // flowed through `draft`/`update`). A live in-progress gizmo drag
    // updates the clip directly (see `onSectionGizmoChange`) rather than
    // waiting for this React round-trip — this is the persisted-value
    // catch-up path, not the real-time one.
    if (this.activeSectionId) {
      const section = config.sections.find((s) => s.id === this.activeSectionId) ?? null;
      this.applyActiveClipping(section);
    }
  }

  /** Sky/Water/Bloom/Clouds "Ocean" tab — sun position (direct
   * elevation/azimuth, matching webgl_shaders_ocean.html's own GUI
   * exactly, no geographic date/time simulation) + the physical sky dome/
   * water it feeds. Recomputed whenever the sun/environment-intensity
   * fields change. */
  applySunAndEnvironment(params: SunEnvironmentParams) {
    this.config = params.config;
    const { config } = params;
    const sun = this.sun;
    const ambient = this.ambient;
    const scene = this.scene;
    if (!sun || !ambient || !scene) return;

    // webgl_watch.html parity — cheap scalar, no shadow-map reallocation
    // needed, safe to set on every call same as the sun direction below.
    sun.shadow.radius = config.shadowSoftness;

    const sunPos = {
      elevationDeg: config.sunElevationDeg,
      azimuthDeg: config.sunAzimuthDeg,
      isNight: config.sunElevationDeg <= 0,
    };
    const dir = sunDirectionVector(sunPos);
    // Real bug fix — must be the exact same distance `sun.shadow.camera`'s
    // near/far were bracketed around in mount() (see `sunDistance`'s own
    // field doc comment for the full "shadow map was always empty" story),
    // not an independent hardcoded value that can silently drift out of
    // sync with it again.
    const distance = this.sunDistance;
    // Offset by the scene's actual center (same point `sun.target` was
    // pointed at, once, in mount()) — `sun.position` set in raw world
    // space with no such offset would only match the intended elevation/
    // azimuth when the scene happened to sit near the world origin; any
    // building whose bounding-box center was offset from (0,0,0) would
    // get a subtly wrong sun angle. Falls back to the origin if called
    // before a mount (shouldn't happen in practice — `sun`/`ambient` are
    // both null until mount() sets them, guarded by the early return
    // above).
    const center = this.sceneCenter ?? new THREE.Vector3();
    sun.position.set(
      center.x + dir.x * distance,
      center.y + Math.max(dir.y, 0.05) * distance,
      center.z + dir.z * distance
    );
    sun.color.setHex(sunColorForElevation(sunPos.elevationDeg));
    sun.intensity = sunPos.isNight ? 0.1 : 1.2 + Math.max(0, sunPos.elevationDeg / 90) * 1.8;
    ambient.intensity = sunPos.isNight ? 0.08 : 0.15;

    // Sky/Water/Bloom/Clouds "Ocean" tab — feeds the same real sun
    // direction into the physical sky dome and water plane, exactly like
    // webgl_shaders_ocean.html's own `updateSun()` feeds one `sun` Vector3
    // into both `sky`/`water`. Kept raw/unclamped (unlike `sun.position`'s
    // `Math.max(dir.y, 0.05)` above, a practical floor so the *light*
    // never comes from below ground) so sunrise/sunset coloring on the sky
    // dome itself still looks correct at low sun angles. All of this is
    // cheap uniform writes — safe to run every tick alongside the rest of
    // this method; only the PMREM capture below is debounced.
    this.sunDirection.set(dir.x, dir.y, dir.z);
    if (this.skyMesh) {
      // Standalone "Sky" tab (webgl_shaders_sky.html parity) — real
      // per-project params, replacing the old fixed SKY_PHYSICAL_PARAMS
      // constant (kept only as that tuple's former-default reference,
      // see viewerPresets.ts). Written every call regardless of
      // `skyEnabled` — cheap uniform writes on a mesh that may just be
      // hidden below, no need to gate them individually.
      this.skyMesh.turbidity.value = config.skyTurbidity;
      this.skyMesh.rayleigh.value = config.skyRayleigh;
      this.skyMesh.mieCoefficient.value = config.skyMieCoefficient;
      this.skyMesh.mieDirectionalG.value = config.skyMieDirectionalG;
      this.skyMesh.sunPosition.value.copy(this.sunDirection);
      // Immediate visibility toggle for a live "off" switch — the
      // expensive PMREM-of-sky-vs-flat-fallback swap happens in the
      // debounced rebuildEnvironment below, but hiding/showing the mesh
      // itself is a free scalar write, no reason to wait on it.
      this.skyMesh.visible = config.skyEnabled;
      // Clouds (webgl_shaders_ocean.html's "Clouds" folder — really just 3
      // more uniforms on the sky shader, see SkyMesh's own field docs).
      // Off by default: coverage/density forced to 0 rather than leaving
      // config.cloudCoverage/cloudDensity's own defaults active, so the
      // physical-sky rollout doesn't also silently add clouds for every
      // project in the same pass.
      this.skyMesh.cloudCoverage.value = config.cloudsEnabled ? config.cloudCoverage : 0;
      this.skyMesh.cloudDensity.value = config.cloudsEnabled ? config.cloudDensity : 0;
      this.skyMesh.cloudElevation.value = config.cloudElevation;
    }
    if (this.waterMesh) {
      this.waterMesh.sunDirection.value.copy(this.sunDirection);
      this.waterMesh.sunColor.value.setHex(sunColorForElevation(sunPos.elevationDeg));
    }

    // Everything above is cheap (a few scalar/vector writes) and applies
    // synchronously on every call, so a live-drag sun elevation/azimuth
    // slider tracks the pointer smoothly. `rebuildEnvironment` below is
    // the expensive part (a real shaded PMREM capture of the sky dome) —
    // debounced so a drag doesn't thrash the GPU on every tick, see
    // scheduleEnvironmentRebuild.
    this.scheduleEnvironmentRebuild(config);
  }

  /** Debounces `rebuildEnvironment` (the real shaded PMREM capture) behind
   * ~150ms of idle after the last call — `applySunAndEnvironment`'s own
   * React effect re-runs on every sun elevation/azimuth slider tick, and
   * before this existed each tick triggered a full synchronous PMREM
   * regeneration. Mirrors EditorShell.tsx's `syncSectionGizmo` debounce
   * idiom. `mountTokenAtStart` guards against the timer outliving a
   * dispose()/remount and firing `rebuildEnvironment` against a torn-down
   * scene. Mount-time `rebuildEnvironment` calls stay direct/synchronous —
   * only this hot, per-tick path is debounced. */
  private scheduleEnvironmentRebuild(config: Project3DConfig) {
    if (this.environmentRebuildTimer != null) clearTimeout(this.environmentRebuildTimer);
    const mountTokenAtStart = this.mountToken;
    this.environmentRebuildTimer = setTimeout(() => {
      this.environmentRebuildTimer = null;
      if (mountTokenAtStart !== this.mountToken) return;
      this.rebuildEnvironment(config);
    }, 150);
  }

  // ---------------------------------------------------------------------
  // Sections module (first-class Configurator module) — real manual
  // clipping-plane authoring/runtime. Pure plane/cap/drag-to-rectangle
  // math lives in ./sections.ts (unit-tested standalone, see
  // scripts/test-sections.ts); everything below is the one place that
  // actually touches the live scene, same division of responsibility the
  // rest of this class already has (React never mutates Three.js objects
  // directly — see the class doc comment).
  // ---------------------------------------------------------------------

  /** A freshly-drawn section's default cut height — roughly mid-building
   * from whatever's actually loaded, so a new section starts somewhere
   * useful instead of at y=0. */
  private defaultSectionHeight(): number {
    if (this.glbRoots.size > 0) {
      const box = new THREE.Box3();
      for (const root of this.glbRoots.values()) box.union(new THREE.Box3().setFromObject(root));
      if (Number.isFinite(box.min.y) && Number.isFinite(box.max.y)) {
        return THREE.MathUtils.lerp(box.min.y, box.max.y, 0.5);
      }
    }
    return 3;
  }

  /** Resolves a pointer event to a world-space point — raycasts against
   * whatever's actually loaded (GLB root, else the procedural ground)
   * first, falling back to the mathematical y=0 ground plane so drawing
   * still works before/without a model loaded. Same
   * `pointerFromEvent`/`Raycaster` pattern `mount()`'s unit hover/click
   * already sets up, reused here for section-drawing clicks instead of
   * the `pickable` unit map. */
  private raycastGround(e: PointerEvent): THREE.Vector3 | null {
    const renderer = this.renderer;
    const camera = this.camera;
    if (!renderer || !camera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const targets: THREE.Object3D[] = [...this.glbRoots.values()];
    if (this.ground) targets.push(this.ground);
    const hits = targets.length > 0 ? raycaster.intersectObjects(targets, true) : [];
    if (hits.length > 0) return hits[0].point.clone();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, point) ? point : null;
  }

  private updateDrawPreview(p1: THREE.Vector3, p2: THREE.Vector3) {
    const helpers = this.sectionHelperGroup;
    if (!helpers) return;
    const y = p1.y;
    const corners = [
      new THREE.Vector3(p1.x, y, p1.z),
      new THREE.Vector3(p2.x, y, p1.z),
      new THREE.Vector3(p2.x, y, p2.z),
      new THREE.Vector3(p1.x, y, p2.z),
      new THREE.Vector3(p1.x, y, p1.z),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(corners);
    if (this.sectionDrawPreview) {
      this.sectionDrawPreview.geometry.dispose();
      this.sectionDrawPreview.geometry = geometry;
    } else {
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x6b55f5 }));
      line.renderOrder = 20;
      helpers.add(line);
      this.sectionDrawPreview = line;
    }
  }

  private clearDrawPreview() {
    const line = this.sectionDrawPreview;
    if (line && this.sectionHelperGroup) {
      this.sectionHelperGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.sectionDrawPreview = null;
  }

  /** Starts the "+ Draw Section" flow — the next two clicks in the
   * viewport become the rectangle's opposite corners; `onComplete` fires
   * once with a new, unsaved `Section` (id/name/scope/buildingName are
   * editor-UI concerns supplied by the caller, not geometry — see
   * `SectionsListRail.tsx`). The caller owns adding it to
   * `draft.sections`/selecting it; this method only produces the value. */
  beginDrawSection(
    opts: { id: string; name: string; scope: Section["scope"]; buildingName?: string },
    onComplete: (section: Section) => void
  ) {
    const renderer = this.renderer;
    if (!renderer) return;
    this.cancelDrawSection();
    let firstPoint: THREE.Vector3 | null = null;

    const onMove = (e: PointerEvent) => {
      if (!firstPoint) return;
      const p = this.raycastGround(e);
      if (p) this.updateDrawPreview(firstPoint, p);
    };
    const onClick = (e: PointerEvent) => {
      const p = this.raycastGround(e);
      if (!p) return;
      if (!firstPoint) {
        firstPoint = p;
        return;
      }
      const section = sectionFromDragPoints(firstPoint, p, {
        id: opts.id,
        name: opts.name,
        heightM: this.defaultSectionHeight(),
        scope: opts.scope,
        buildingName: opts.buildingName,
      });
      this.cancelDrawSection();
      onComplete(section);
    };

    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("click", onClick);
    this.drawSection = { onMove, onClick };
  }

  cancelDrawSection() {
    const renderer = this.renderer;
    if (this.drawSection && renderer) {
      renderer.domElement.removeEventListener("pointermove", this.drawSection.onMove);
      renderer.domElement.removeEventListener("click", this.drawSection.onClick);
    }
    this.drawSection = null;
    this.clearDrawPreview();
  }

  /** Rebuilds the active section's real clip (`clippingGroup.clippingPlanes`)
   * and cap mesh — the single place both the admin editor (selecting/
   * editing a section) and the public runtime (a visitor activating a
   * floor) funnel through, so the cap and the clip can never disagree.
   * `null` clears both. */
  private applyActiveClipping(section: Section | null) {
    // Real click-freeze bug fix (2026-08-14, "Clipping doesn't work") —
    // `NO_ACTIVE_SECTION_PLANES` instead of `[]` here specifically: see
    // its own doc comment in sections.ts for the full mechanism (a
    // changed clip-plane *count* forces a real ~12s shader/pipeline
    // recompile across every clipped mesh; keeping the count fixed at 6
    // always means this is now a cheap uniform update instead).
    if (this.clippingGroup) {
      this.clippingGroup.clippingPlanes = section ? buildSectionPlanes(section) : NO_ACTIVE_SECTION_PLANES;
    }
    this.rebuildSectionCap(section);
  }

  /** Every real `THREE.Mesh` currently in `clippingGroup` — the actual
   * clippable content (GLB roots and/or procedural ground/shells/unit
   * boxes), traversed recursively since a GLB root is a nested hierarchy,
   * not a flat list. This is the geometry the section fill technique
   * borrows (back faces only, see `sectionFillMeshes`'s own doc comment)
   * — deliberately NOT a synthetic proxy box, so the fill only appears
   * where real geometry was actually cut open, not the section's full
   * authored rectangle. */
  private collectClippableMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.clippingGroup?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
    });
    return meshes;
  }

  /** Removes every real color-fill mesh (`sectionFillMeshes`) from the
   * scene — the shared `sectionFillMaterial` is NOT disposed here (it
   * outlives any one rebuild, same as `sectionIndicatorMaterial`; both
   * are only disposed in `dispose()`), only each mesh's own borrowed-
   * geometry reference is dropped (the geometry itself belongs to the
   * source mesh in `clippingGroup`, never owned/disposed here). */
  private clearSectionFillMeshes() {
    for (const mesh of this.sectionFillMeshes) {
      this.sectionFillClippingGroup?.remove(mesh);
      this.sectionHelperGroup?.remove(mesh);
    }
    this.sectionFillMeshes = [];
  }

  /** Real behavior, not just a color swap (see `Section.fillGapsEnabled`'s
   * own doc comment for the full contract):
   * - `fillGapsEnabled: true` — opaque, admin-picked `fillColor`, shown on
   *   the real cut surface only (back-face fill — see
   *   `sectionFillMeshes`'s own doc comment for the technique and its
   *   2026-08-14 history), in both the editor and the public viewer.
   * - `fillGapsEnabled: false` — a translucent (50%) neutral "clip plane
   *   indicator" rectangle in the admin editor only; skipped entirely (no
   *   mesh at all, not just alpha'd to invisible) in the public viewer,
   *   since it's a pure editing aid a visitor has no use for. Stays a
   *   plain, unclipped rectangle deliberately: while dragging/resizing a
   *   section an admin needs to see the boundary they're actually
   *   drawing, not a geometry-dependent fill that may show nothing at all
   *   if the section isn't over any geometry yet. */
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
    if (!section.fillGapsEnabled && !this.isEditorPreview) return;

    if (section.fillGapsEnabled) {
      if (!this.sectionFillClippingGroup) {
        this.sectionFillClippingGroup = new THREE.ClippingGroup();
        helpers.add(this.sectionFillClippingGroup);
      }
      // Full plane set (not just the top plane) — a box-shaped section
      // can cut through solid geometry on any of its faces (side walls
      // too, if the section boundary itself slices through a building,
      // not just its own top/bottom); `heightOnly` sections get the same
      // treatment for free since their side planes are already inert
      // `noClipPlane()`s (see that field's own doc comment) — nothing
      // extra to special-case here.
      this.sectionFillClippingGroup.clippingPlanes = buildSectionPlanes(section);

      if (!this.sectionFillMaterial) {
        this.sectionFillMaterial = new THREE.MeshBasicMaterial({ color: section.fillColor, side: THREE.BackSide });
      } else {
        // A plain color change is a uniform update, not a pipeline-
        // affecting one (unlike the old stencil material's transparent/
        // depthWrite/stencilWrite toggling) — no `needsUpdate` dance
        // needed here; this material's `side`/opacity/transparency never
        // change after construction.
        this.sectionFillMaterial.color.set(section.fillColor);
      }

      for (const source of this.collectClippableMeshes()) {
        const fillMesh = new THREE.Mesh(source.geometry, this.sectionFillMaterial);
        // Shares source's world transform directly rather than
        // re-parenting (source stays exactly where it is, inside
        // clippingGroup) — sectionHelperGroup sits at identity at the
        // scene root, so copying world-space matrixWorld straight into
        // local .matrix (with matrixAutoUpdate off, so nothing overwrites
        // it) reproduces the same placement. `sectionFillClippingGroup`
        // (its real parent, added to `helpers` above) also sits at
        // identity, so this world-space copy is still valid one level
        // deeper.
        fillMesh.matrixAutoUpdate = false;
        fillMesh.matrix.copy(source.matrixWorld);
        fillMesh.frustumCulled = false;
        fillMesh.castShadow = false;
        fillMesh.receiveShadow = false;
        // Draws after the clipped geometry so it doesn't z-fight with
        // whatever real geometry the cut happens to graze exactly at the
        // clip planes.
        fillMesh.renderOrder = 10;
        this.sectionFillClippingGroup.add(fillMesh);
        this.sectionFillMeshes.push(fillMesh);
      }
    } else {
      // Translucent editing indicator — unchanged plain rectangle, sized
      // to the section's own drawn footprint, unclipped, no back-face
      // trick needed (it's not meant to look like real cut geometry).
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

  /** Activates a section by id (real clip + cap) or clears it (`null`) —
   * the entry point both `SectionsListRail.tsx` (selecting a section to
   * edit) and the public runtime (a visitor clicking a floor in the
   * bottom-chrome Sections panel) call. Does not itself attach/detach the
   * editing gizmo — those are orthogonal (browsing a clipped view vs.
   * actively dragging its handles). */
  activateSection(sectionId: string | null) {
    this.activeSectionId = sectionId;
    const section = sectionId ? this.config.sections.find((s) => s.id === sectionId) ?? null : null;
    this.applyActiveClipping(section);
  }

  /** Reads the gizmo anchor's live transform back into a `Section`, keyed
   * off whatever `attachSectionGizmo` last stored in `liveSection` (so
   * every other field — name/scope/fillGapsEnabled/fillColor/floorId/etc.
   * — survives untouched). */
  private onSectionGizmoChange() {
    const anchor = this.sectionGizmoAnchor;
    const base = this.liveSection;
    if (!anchor || !base) return;
    const next: Section = {
      ...base,
      centerX: anchor.position.x,
      centerZ: anchor.position.z,
      heightM: anchor.position.y,
      // Wrapped into (-180, 180] — real bug fix: `anchor.rotation.y` is a
      // raw Euler radian value that three.js never re-normalizes, so
      // spinning the Rotate handle more than one full turn (very easy to
      // do by accident, dragging in a circle) used to produce values like
      // 540° or -720°. That's outside both the panel slider's own
      // [-180, 180] range AND the PATCH route's zod
      // `rotationDeg: z.number().min(-360).max(360)` — an out-of-range
      // value here would 400 the *entire* config save (sections is one
      // field in one all-or-nothing PATCH body), not just fail to persist
      // this one section. Wrapping preserves the exact same visual
      // rotation (sin/cos are periodic) while always staying in range.
      rotationDeg: THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(anchor.rotation.y) + 180, 360) - 180,
      // Real bug fix (2026-08-14, "resize doesn't save") — same class of
      // bug the rotationDeg wrap above already fixed: nothing capped the
      // Resize handle's drag distance, so an admin dragging well past the
      // server's own max produced a `Section` the PATCH route's zod
      // schema then rejected outright (400s the whole config save, not
      // just this field) — the edit looked fine on screen and in the
      // panel's own numbers, then silently never persisted. Clamped to
      // the exact same bound the server enforces (`SECTION_MAX_DIMENSION_M`,
      // shared from sections.ts) so a drag can no longer produce a value
      // guaranteed to be rejected.
      widthM: Math.min(SECTION_MAX_DIMENSION_M, Math.max(0.5, anchor.scale.x)),
      depthM: Math.min(SECTION_MAX_DIMENSION_M, Math.max(0.5, anchor.scale.z)),
    };
    this.liveSection = next;
    this.applyActiveClipping(next);
    this.callbacks.onSectionDraftChange?.(next);
  }

  /** Switches the gizmo's mode (the Move/Rotate/Resize/Height toolbar
   * buttons) — safe to call whether or not a gizmo is currently attached
   * (no-op if not); also called internally by `attachSectionGizmo`. */
  setSectionGizmoMode(mode: "move" | "rotate" | "resize" | "height") {
    const gizmo = this.sectionGizmo;
    if (!gizmo) return;
    // Each of the 4 authoring modes is a real TransformControls mode +
    // axis restriction (its own `showX`/`showY`/`showZ` toggles) —
    // reusing three's own gizmo rather than 4 bespoke hand-built ones.
    if (mode === "move") {
      gizmo.setMode("translate");
      gizmo.showX = true;
      gizmo.showY = false;
      gizmo.showZ = true;
    } else if (mode === "height") {
      gizmo.setMode("translate");
      gizmo.showX = false;
      gizmo.showY = true;
      gizmo.showZ = false;
    } else if (mode === "rotate") {
      gizmo.setMode("rotate");
      gizmo.showX = false;
      gizmo.showY = true;
      gizmo.showZ = false;
    } else {
      gizmo.setMode("scale");
      gizmo.showX = true;
      gizmo.showY = false;
      gizmo.showZ = true;
    }
  }

  /** Attaches the editing gizmo to `section` in the given mode — also
   * activates it (live clip + cap) so the admin sees what they're
   * editing. Reuses one lazily-created `TransformControls` instance
   * across attach calls (just re-targets/re-modes it) rather than
   * recreating per section/mode switch.
   *
   * Real bug fixed here: this used to call `this.activateSection(section.id)`,
   * which re-derives the section from `this.config.sections.find(...)` —
   * `this.config` only gets refreshed by `applyLiveUpdate()`, which the
   * admin editor's per-field edits don't trigger (Sections aren't in that
   * effect's dependency list — cheap, local React state otherwise). So a
   * just-drawn section (never yet in `this.config.sections`) or a section
   * mid-edit from the panel would silently activate a *stale* — or, for a
   * brand-new section, nonexistent — snapshot instead of what's actually
   * being edited, meaning the live clip/cap the admin sees could lag
   * behind or briefly vanish. Now applies the clip/cap directly from the
   * `section` argument, which is always the fresh, authoritative value the
   * caller (EditorShell.tsx) just computed — no re-lookup needed. */
  attachSectionGizmo(section: Section, mode: "move" | "rotate" | "resize" | "height") {
    const camera = this.camera;
    const renderer = this.renderer;
    const helpers = this.sectionHelperGroup;
    if (!camera || !renderer || !helpers) return;

    this.liveSection = { ...section };
    this.activeSectionId = section.id;
    this.applyActiveClipping(section);

    if (!this.sectionGizmoAnchor) {
      const anchor = new THREE.Object3D();
      helpers.add(anchor);
      this.sectionGizmoAnchor = anchor;
    }
    const anchor = this.sectionGizmoAnchor;
    anchor.position.set(section.centerX, section.heightM, section.centerZ);
    anchor.rotation.set(0, THREE.MathUtils.degToRad(section.rotationDeg), 0);
    anchor.scale.set(section.widthM, 1, section.depthM);

    if (!this.sectionGizmo) {
      const gizmo = new TransformControls(camera, renderer.domElement);
      gizmo.addEventListener("dragging-changed", (event: { value: unknown }) => {
        if (this.controls) this.controls.enabled = !event.value;
        // Real bug fix (Sections "doesn't save" audit): `onSectionDraftChange`
        // (fired per-tick by `onSectionGizmoChange` below, via
        // `objectChange`) only ever updated the live 3D preview and the
        // panel's *displayed* numbers (`EditorShell.tsx`'s
        // `liveSectionOverride`) — nothing wrote the drag's result back
        // into `draft.sections`, the state Save/autosave actually PATCH.
        // So Move/Rotate/Resize/Height gizmo edits looked correct
        // on-screen but silently reverted on save. Fired once here, on
        // drag-end (`event.value` false = "no longer dragging"), with
        // whatever `onSectionGizmoChange` last computed into
        // `this.liveSection` — one drag, one real commit into React
        // state, matching every other panel field's `commit: true`
        // convention for a discrete edit.
        if (!event.value && this.liveSection) {
          this.callbacks.onSectionDraftCommit?.(this.liveSection);
        }
      });
      gizmo.addEventListener("objectChange", () => this.onSectionGizmoChange());
      helpers.add(gizmo.getHelper());
      this.sectionGizmo = gizmo;
    }
    this.sectionGizmo.attach(anchor);
    this.setSectionGizmoMode(mode);
  }

  detachSectionGizmo() {
    const gizmo = this.sectionGizmo;
    if (gizmo) {
      gizmo.detach();
      this.sectionHelperGroup?.remove(gizmo.getHelper());
      gizmo.dispose();
    }
    this.sectionGizmo = null;
    if (this.sectionGizmoAnchor && this.sectionHelperGroup) {
      this.sectionHelperGroup.remove(this.sectionGizmoAnchor);
    }
    this.sectionGizmoAnchor = null;
    this.liveSection = null;
  }

  getLiveSectionDraft(): Section | null {
    return this.liveSection;
  }
}
