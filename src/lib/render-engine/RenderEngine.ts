import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { pass, positionWorld, length as tslLength, smoothstep, mix, uniform } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { LensflareMesh, LensflareElement } from "three/examples/jsm/objects/LensflareMesh.js";
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
// Sky/Water/Bloom/Clouds pass — WebGPU-native counterparts of
// webgl_shaders_ocean.html's classic `Sky`/`Water` (those two are
// WebGLRenderer-only, per their own source doc comments; `SkyMesh`/
// `WaterMesh` are the TSL/NodeMaterial ports for this app's
// WebGPURenderer pipeline). `SkyMesh` already ships the demo's "Clouds"
// GUI folder baked in as 3 more uniforms on the same shader — no separate
// cloud object exists in either version.
import { SkyMesh } from "three/examples/jsm/objects/SkyMesh.js";
import { WaterMesh } from "three/examples/jsm/objects/WaterMesh.js";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { applyUnitBoxMaterial, disposeGlbObject3D } from "@/lib/glbUnitNodes";
import { calcSunPosition, sunColorForElevation, sunDirectionVector } from "@/lib/sunPosition";
import {
  ADAPTIVE_DOWNGRADE_ORDER,
  GLASS_NODE_PATTERN,
  GLASS_TIERS,
  GROUND_INFINITE_SIZE,
  MATERIAL_PRESETS,
  QUALITY_TIERS,
  SELECTED_COLOR,
  SKY_DOME_SCALE,
  SKY_GRADIENTS,
  SKY_PHYSICAL_PARAMS,
  UNIT_BOX_COLOR,
  UNIT_BOX_OPACITY,
  UNIT_BOX_SELECTED_OPACITY,
  WATER_PLANE_SIZE,
  type QualityTierSettings,
} from "@/lib/viewerPresets";
import { buildSectionCapGeometry, buildSectionPlanes, sectionFromDragPoints, SECTION_INDICATOR_COLOR } from "./sections";
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
// Light probe (webgl_lightprobes_sponza.html technique) cube capture size
// — this only feeds 9 spherical-harmonics coefficients, not visible
// reflections (the existing PMREM environment already handles those), so
// a tiny cube keeps the async pixel-readback cost negligible.
const LIGHT_PROBE_CUBE_SIZE = 16;

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
  constructionProgressPercent: number | undefined;
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
  project: Project;
  config: Project3DConfig;
  effectiveTimeOfDay: number;
}

export interface RefreshAppearanceParams {
  project: Project;
  config: Project3DConfig;
  usingGlb: boolean;
  selectedUnitId: string | null;
  filters: UnitFilters;
  constructionProgressPercent: number | undefined;
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
  private hdriTexture: THREE.Texture | null = null;
  private hdriUrlLoaded: string | null = null;
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
  /** The scene's bounding-box center, computed once per mount() — `sun.target`
   * is pointed here once and never moves again, so `applySunAndEnvironment`
   * needs the same point to offset `sun.position` by; otherwise the sun's
   * actual direction (position - target) only matches the intended
   * elevation/azimuth when the scene happens to sit near the world origin. */
  private sceneCenter: THREE.Vector3 | null = null;
  // --- Sky/Water/Bloom/Clouds pass ---
  /** The physical sky dome — replaces the old CanvasTexture gradient
   * (`buildSkyTexture`) as the actual "sky" backgroundPreset's visible
   * backdrop, live in the scene like webgl_shaders_ocean.html's `sky`
   * (not painted onto `scene.background`). Built once per mount() (same
   * lifecycle as `lensflare`/`lightProbe`); hidden (not removed — cheaper
   * to toggle) whenever an HDRI is active or backgroundPreset isn't
   * "sky". `null` only before the first mount()/after dispose(). */
  private skyMesh: SkyMesh | null = null;
  /** Last real sun *direction* (unit vector, world space) computed by
   * `applySunAndEnvironment` — `sun.position` itself is an absolute point
   * offset from `sceneCenter`, not a direction, so this is kept separately
   * to feed `skyMesh.sunPosition`/`waterMesh.sunDirection` exactly like
   * the reference demo's own `sun` Vector3 feeds both. */
  private sunDirection = new THREE.Vector3(0, 1, 0);
  /** The optional water plane (`WaterMesh`) — only constructed when
   * `config.waterEnabled` (per-project opt-in; most projects have none),
   * so toggling it needs a fresh mount() same as `sectionCapStencilEnabled`
   * already does, rather than always paying for an unused texture
   * load/reflection render target. */
  private waterMesh: WaterMesh | null = null;
  /** The bloom node itself (not just a boolean) — `strength`/`radius` are
   * real `UniformNode<float>`s on this instance (confirmed against
   * BloomNode.js's own source), so `applyLiveUpdate` can drag those live
   * without rebuilding the whole post-processing pipeline; only
   * `bloomEnabled` itself (which structurally adds/removes the node from
   * the chain) needs a fresh mount, same as `antialiasEnabled`. */
  private bloomNode: ReturnType<typeof bloom> | null = null;
  /** Debounces the expensive PMREM/light-probe rebuild inside
   * `applySunAndEnvironment` — see `scheduleEnvironmentRebuild`. */
  private environmentRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private ambient: THREE.AmbientLight | null = null;
  private lensflare: LensflareMesh | null = null;
  private lightProbe: THREE.LightProbe | null = null;
  private lightProbeCubeTarget: THREE.CubeRenderTarget | null = null;
  /** Guards the async LightProbeGenerator readback against a slow-
   * resolving, since-superseded capture (rebuildEnvironment can fire
   * many times per mount — every time-of-day tick re-runs it) applying
   * stale SH data out of order, or applying after dispose(). */
  private lightProbeToken = 0;

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
  private shells: THREE.Mesh[] = [];
  private unitBoxes: UnitBox[] = [];

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
  private sectionCapMesh: THREE.Mesh | null = null;
  private sectionCapMaterial: THREE.MeshBasicMaterial | null = null;
  /** Cheap signature of `sectionCapMaterial`'s pipeline-affecting state
   * (transparent/depthWrite/stencil-branch) — lets `rebuildSectionCap`
   * only bump `needsUpdate` (a real WebGPU pipeline rebuild, see that
   * method's own doc comment) when that state actually changed, not on
   * every call. Needed because this method also runs on every gizmo-drag
   * tick (pure position/rotation/scale changes), where fill/stencil state
   * never differs from the previous call. */
  private sectionCapMaterialSignature: string | null = null;
  /** Stencil-derived cap (webgl_clipping_stencil.html technique,
   * `config.sectionCapStencilEnabled`) — invisible back/front marking
   * mesh pairs, one pair per real clippable object currently in
   * `clippingGroup`, sharing that object's own geometry (not cloned) and
   * world transform. Rebuilt alongside `sectionCapMesh` in
   * `rebuildSectionCap`; disposed on every rebuild and in `dispose()`
   * (materials only — the shared geometry is borrowed, not owned). */
  private stencilMarkMeshes: THREE.Mesh[] = [];
  /** Real bug fix: the stencil cap technique used to set `clippingPlanes`
   * directly on each material (`sectionCapMaterial`, the back/front
   * marking materials) — verified against the installed three.js source
   * (grepped the entire renderer/nodes tree for any consumer of
   * `material.clippingPlanes`; only `ClippingContext`/`ClippingGroup` are
   * ever read) that this is a **complete no-op** under this app's
   * `THREE.WebGPURenderer`, same lesson [[rozaris-3d-sections-module]]
   * already learned for the main clip — silently reintroduced here. For a
   * closed/watertight mesh, marking WITHOUT the intended `[topPlane]`
   * clip means every ray crosses equal front/back faces, so the
   * increment/decrement passes always net to exactly 0 — the cap's
   * `NotEqualStencilFunc` test then fails everywhere, rendering nothing.
   * Fixed with two persistent, lazily-created `ClippingGroup`s (the same
   * real mechanism `this.clippingGroup` already uses) nested inside
   * `sectionHelperGroup`: this one clips the back/front marking mesh
   * pairs to just the section's top plane. */
  private stencilMarkClippingGroup: THREE.ClippingGroup | null = null;
  /** Bounds the stencil-mode cap's flat quad to the section's other
   * (non-top) planes — matches the upstream example's own
   * `planes.filter(p => p !== plane)` cap-clipping pattern. See
   * `stencilMarkClippingGroup`'s doc comment for why a `ClippingGroup`,
   * not per-material `clippingPlanes`, is required here. */
  private sectionCapClippingGroup: THREE.ClippingGroup | null = null;
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
   * around the current target. For the procedural fallback this scene has
   * no real geographic orientation; for a loaded GLB it's an
   * approximation too (true alignment would need to also account for
   * `config.northRotationDeg` against the *camera*, not just the sun —
   * known Phase 1 simplification). */
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

  private applyUnitAppearance(
    mesh: THREE.Mesh,
    box: UnitBox,
    params: { selectedUnitId: string | null; filters: UnitFilters; constructionProgressPercent: number | undefined; constructionStagesEnabled: boolean }
  ) {
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

    const progress = params.constructionProgressPercent ?? this.project.progressPercent;
    const isBuilt =
      !params.constructionStagesEnabled ||
      this.project.status !== "under_construction" ||
      box.floorIndex / Math.max(1, box.totalFloorsInBuilding) <= progress / 100;
    mesh.visible = this.matchesFilters(box.unit, params.filters) && isBuilt;
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
            constructionProgressPercent: params.constructionProgressPercent,
            constructionStagesEnabled: params.config.constructionStagesEnabled,
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
      const hasMaterialOverride = !!(
        preset ||
        override.colorHex ||
        override.roughness != null ||
        override.metalness != null ||
        override.opacity != null
      );
      const mesh = child as THREE.Mesh;
      if (!hasMaterialOverride || !mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => {
        const std = mat as THREE.MeshStandardMaterial;
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
      });
    });
  }

  // --- Procedural (gradient) sky + real environment/reflection lighting,
  // shared by both content modes. A plain CanvasTexture is
  // backend-agnostic (WebGPU and WebGL2 render it identically). ---
  /** Procedural lens-flare element textures — same "canvas gradient, no
   * external asset dependency" technique `buildSkyTexture` already uses
   * below, applied to a radial gradient instead of a linear one. "glow"
   * is the bright core disc at the light's own screen position;
   * "ring" is a soft, mostly-transparent halo used for the trailing
   * secondary flare elements (LensflareMesh's own tinting via
   * `LensflareElement`'s `color` param does the actual per-element
   * color variation — these textures stay neutral white/gray). */
  private buildLensflareTexture(kind: "glow" | "ring"): THREE.Texture {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2;
    const cy = size / 2;
    if (kind === "glow") {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.15, "rgba(255,248,230,0.9)");
      gradient.addColorStop(0.4, "rgba(255,244,214,0.25)");
      gradient.addColorStop(1, "rgba(255,244,214,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    } else {
      const gradient = ctx.createRadialGradient(cx, cy, size * 0.26, cx, cy, size * 0.5);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.55, "rgba(255,255,255,0.55)");
      gradient.addColorStop(0.75, "rgba(255,255,255,0.25)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildSkyTexture(skyPreset: Project3DConfig["skyPreset"]): THREE.Texture {
    const stops = SKY_GRADIENTS[skyPreset];
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, stops.top);
    gradient.addColorStop(0.55, stops.horizon);
    gradient.addColorStop(1, stops.ground);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** Fog color when `config.fogMatchesSky` is on — the "seamless horizon"
   * technique from three.js's webgl_geometry_terrain example (that demo
   * matches its fog color to the sky/clear color so distant geometry
   * fades into the backdrop instead of a visible fog-vs-sky seam).
   * Resolved cheaply, without any GPU readback, from whatever's already
   * driving `scene.background`:
   * - non-"sky" backgroundPresets already resolve to one of two flat
   *   THREE.Color literals (see rebuildEnvironment below) — reused
   *   exactly here, so fog and background always match precisely.
   * - the procedural gradient sky's own `horizon` stop (SKY_GRADIENTS,
   *   the same data `buildSkyTexture` paints) is exactly the color a
   *   distant, level view of that sky actually shows.
   * - a loaded platform HDRI has no equivalently cheap single "horizon
   *   color" to derive without an async pixel readback of the PMREM
   *   target — adding that would make what's meant to be a cheap live
   *   update async and comparatively expensive, so this case honestly
   *   falls back to the authored `config.fogColor` instead of guessing.
   */
  private resolveFogColor(config: Project3DConfig): string {
    if (!config.fogMatchesSky) return config.fogColor;
    if (config.backgroundPreset !== "sky") {
      return config.backgroundPreset === "studio_dark" ? "#141414" : "#f0efe9";
    }
    if (this.hdriTexture) return config.fogColor;
    return SKY_GRADIENTS[config.skyPreset].horizon;
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

  /** Sky/Water/Bloom/Clouds pass — the procedural (non-HDRI) branch used
   * to feed a flat gradient `CanvasTexture` through
   * `pmrem.fromEquirectangular`; it now captures the real physical sky
   * dome (`this.skyMesh`) via `pmrem.fromScene`, the same "temporarily
   * move the mesh into an offscreen capture scene, then back into the
   * visible one" trick webgl_shaders_ocean.html's own `updateSun()` uses
   * (that single mesh instance is also the visible backdrop when
   * `backgroundPreset` is "sky", so it can't just live permanently in a
   * separate scene). HDRI mode is untouched — same `fromEquirectangular`
   * path as before, `skyMesh` simply stays hidden. */
  private rebuildEnvironment(config: Project3DConfig) {
    const renderer = this.renderer;
    const scene = this.scene;
    const envScene = this.envScene;
    const pmrem = this.pmrem;
    const skyMesh = this.skyMesh;
    if (!renderer || !scene || !envScene || !pmrem || !skyMesh) return;
    const usingHdri = !!this.hdriTexture;

    let renderTarget: ReturnType<typeof pmrem.fromEquirectangular>;
    if (usingHdri) {
      renderTarget = pmrem.fromEquirectangular(this.hdriTexture!);
    } else {
      // Env/reflection lighting always comes from the sky PMREM regardless
      // of backgroundPreset (same rule this method already followed for
      // the old gradient texture) — visibility of the dome itself as the
      // literal backdrop is decided separately, below. `far` is passed
      // defensively past `SKY_DOME_SCALE` (default is only 100, per
      // PMREMGenerator's own source) — SkyMesh's vertex shader pins its
      // own clip-space depth to the far plane either way (the standard
      // "always render behind everything" skybox trick), so in practice
      // this mostly guards against a future change to that shader, not a
      // failure observed today.
      skyMesh.visible = true;
      scene.remove(skyMesh);
      envScene.add(skyMesh);
      renderTarget = pmrem.fromScene(envScene, 0, 0.1, SKY_DOME_SCALE * 1.5);
      envScene.remove(skyMesh);
      scene.add(skyMesh);
    }

    // Light-probe SH capture (optional, off by default) stays on the cheap
    // equirect-texture path (`fromEquirectangularTexture`) rather than a
    // second real render of `skyMesh` — an approximate indirect-light
    // source is enough for a probe nobody has opted into yet; the gradient
    // this reuses (`buildSkyTexture`) is a reasonable stand-in for the
    // physical sky's general mood (same preset, same time of day) even
    // though it won't reflect clouds or `SKY_PHYSICAL_PARAMS` exactly.
    const lightProbeSource = usingHdri ? this.hdriTexture! : this.buildSkyTexture(config.skyPreset);
    if (config.lightProbeEnabled && this.lightProbeCubeTarget) {
      this.lightProbeCubeTarget.fromEquirectangularTexture(renderer, lightProbeSource);
      void this.captureLightProbe();
    } else if (this.lightProbe) {
      this.lightProbe.intensity = 0;
    }
    if (!usingHdri) lightProbeSource.dispose();

    this.envRenderTarget?.dispose();
    this.envRenderTarget = renderTarget;
    scene.environment = renderTarget.texture;
    scene.environmentIntensity = config.environmentIntensity;

    if (config.backgroundPreset === "sky") {
      // The HDRI still paints scene.background as an equirect texture
      // (unchanged behavior); the physical sky dome paints itself
      // directly as real geometry instead, so background stays unset —
      // the renderer draws `skyMesh` (visible below) rather than a flat
      // equirect of it.
      scene.background = usingHdri ? renderTarget.texture : null;
      scene.backgroundIntensity = config.environmentIntensity;
      skyMesh.visible = !usingHdri;
    } else {
      scene.background = new THREE.Color(config.backgroundPreset === "studio_dark" ? 0x141414 : 0xf0efe9);
      scene.backgroundIntensity = 1;
      skyMesh.visible = false;
    }
  }

  /** Async spherical-harmonics readback for the light probe — kicked off
   * fire-and-forget from rebuildEnvironment (which must stay synchronous;
   * several of its callers, including this class's own mount()/
   * applySunAndEnvironment(), aren't async). Token + mountToken-guarded
   * so a slow-resolving capture from an already-superseded environment
   * (rapid time-of-day dragging re-triggers rebuildEnvironment on every
   * tick) or a since-disposed engine can never apply stale/orphaned SH
   * data — same reasoning this class's other fire-and-forget async work
   * (e.g. setHdri) already documents for mountToken. */
  private async captureLightProbe() {
    const renderer = this.renderer;
    const cubeTarget = this.lightProbeCubeTarget;
    const lightProbe = this.lightProbe;
    if (!renderer || !cubeTarget || !lightProbe) return;
    const token = ++this.lightProbeToken;
    const mountTokenAtStart = this.mountToken;
    try {
      const generated = await LightProbeGenerator.fromCubeRenderTarget(renderer, cubeTarget);
      if (token !== this.lightProbeToken || mountTokenAtStart !== this.mountToken) return;
      lightProbe.sh.copy(generated.sh);
      lightProbe.intensity = 1;
    } catch (err) {
      console.warn("3D Experience: light probe capture failed", err);
    }
  }

  /** Platform HDRI loading (Task 2 — Track A) — separate from
   * rebuildEnvironment above because parsing a .hdr/.exr file is
   * inherently async, unlike the procedural gradient. Loads once per
   * distinct `hdriUrl`, then triggers a synchronous rebuild; `null` (no
   * HDRI selected, or it failed to load) falls back to the procedural sky
   * gradient. Caller (the component's HDRI effect) is responsible for only
   * calling this when `ready` and for not calling it again for the same
   * URL — mirrors the original effect's own guard logic exactly. */
  async setHdri(hdriUrl: string | null, config: Project3DConfig) {
    if (!hdriUrl) {
      if (this.hdriTexture) {
        this.hdriTexture.dispose();
        this.hdriTexture = null;
        this.hdriUrlLoaded = null;
        this.rebuildEnvironment(config);
      }
      return;
    }
    if (this.hdriUrlLoaded === hdriUrl && this.hdriTexture) return;
    const token = this.mountToken;
    const isExr = hdriUrl.toLowerCase().endsWith(".exr");
    const loader = isExr ? new EXRLoader() : new RGBELoader();
    await new Promise<void>((resolve) => {
      loader.load(
        hdriUrl,
        (texture) => {
          if (token !== this.mountToken) return resolve();
          texture.mapping = THREE.EquirectangularReflectionMapping;
          this.hdriTexture?.dispose();
          this.hdriTexture = texture;
          this.hdriUrlLoaded = hdriUrl;
          this.rebuildEnvironment(config);
          resolve();
        },
        undefined,
        (err) => {
          if (token !== this.mountToken) return resolve();
          console.warn("3D Experience: Platform HDRI failed to load, falling back to procedural sky", err);
          this.hdriTexture = null;
          this.hdriUrlLoaded = null;
          this.rebuildEnvironment(config);
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
   * Bloom (Sky/Water/Bloom/Clouds pass) — was a hardcoded-always-off TSL
   * node before this; now a real per-project toggle
   * (`config.bloomEnabled`), ANDed with `tier.bloom` exactly like
   * `antialiasEnabled` already is against `tier.antialias`. Threshold
   * stays fixed at 0.85 — same as webgl_shaders_ocean.html's own Bloom GUI
   * folder, which only exposes strength/radius too. */
  private buildRenderPipeline(tier: QualityTierSettings) {
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    this.bloomNode = null;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return;
    try {
      const scenePass = pass(scene, camera);
      const color = scenePass.getTextureNode("output");

      let chain: THREE.Node<"vec4"> = color;
      if (tier.bloom && this.config.bloomEnabled) {
        const bloomNode = bloom(chain, this.config.bloomStrength, this.config.bloomRadius, 0.85);
        this.bloomNode = bloomNode;
        chain = chain.add(bloomNode);
      }

      const pipeline = new THREE.RenderPipeline(renderer);
      pipeline.outputNode = tier.antialias && this.config.antialiasEnabled ? smaa(chain) : chain;
      this.renderPipeline = pipeline;
    } catch (err) {
      console.error("3D Experience: post-processing pipeline failed, falling back to direct render", err);
      this.renderPipeline = null;
      this.bloomNode = null;
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
      // Off by default (matches WebGPURenderer's own default) — only
      // requested when the stencil-derived Section cap technique is on,
      // since it's the one thing in this renderer that needs it (see
      // rebuildSectionCap's stencil branch). A renderer-construction-time
      // flag, not a live toggle — changing it requires a fresh mount.
      stencil: config.sectionCapStencilEnabled,
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

    // Light probe (webgl_lightprobes_sponza.html technique) — real
    // spherical-harmonics irradiance, additive alongside the flat
    // AmbientLight below, not a replacement for it. Capture itself
    // happens in rebuildEnvironment() (needs the same equirect sky
    // texture that method already builds for PMREM); this just
    // allocates the probe + its tiny capture target once, up front.
    // intensity starts at 0 — stays that way until a real capture
    // resolves, so there's no one-frame flash of un-lit SH default data.
    const lightProbeCubeTarget = new THREE.CubeRenderTarget(LIGHT_PROBE_CUBE_SIZE);
    this.lightProbeCubeTarget = lightProbeCubeTarget;
    const lightProbe = new THREE.LightProbe();
    lightProbe.intensity = 0;
    scene.add(lightProbe);
    this.lightProbe = lightProbe;

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
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(sun, sun.target, ambient);
    this.sun = sun;
    this.ambient = ambient;

    // Lens flare (webgl_lensflares.html technique) — LensflareMesh, the
    // WebGPU-native port shipped alongside the classic (WebGL-only)
    // Lensflare in three.js 0.185.1; same addElement/light.add(lensflare)
    // API. Attached to the sun exactly like the upstream example attaches
    // to its light — light-type-agnostic (only reads its own
    // this.matrixWorld, inherited from the parent light), so this works
    // the same for a DirectionalLight as the example's PointLight.
    // Procedural textures (buildLensflareTexture), no external asset
    // dependency, same reasoning as buildSkyTexture's canvas gradients.
    const lensflare = new LensflareMesh();
    lensflare.addElement(new LensflareElement(this.buildLensflareTexture("glow"), 700, 0));
    lensflare.addElement(new LensflareElement(this.buildLensflareTexture("ring"), 140, 0.35, new THREE.Color(0x8fb4ff)));
    lensflare.addElement(new LensflareElement(this.buildLensflareTexture("ring"), 90, 0.6, new THREE.Color(0xffffff)));
    lensflare.addElement(new LensflareElement(this.buildLensflareTexture("ring"), 60, 0.9, new THREE.Color(0xc9a6ff)));
    lensflare.visible = config.lensflareEnabled;
    sun.add(lensflare);
    this.lensflare = lensflare;

    // Physical sky dome (Sky/Water/Bloom/Clouds pass) — built once per
    // mount like lensflare/lightProbe above; visibility (only the actual
    // backdrop when backgroundPreset is "sky" and no HDRI is active) and
    // its turbidity/rayleigh/mie/cloud/sunPosition uniforms are handled by
    // rebuildEnvironment/applySunAndEnvironment, not here.
    const skyMesh = new SkyMesh();
    skyMesh.scale.setScalar(SKY_DOME_SCALE);
    scene.add(skyMesh);
    this.skyMesh = skyMesh;

    // Optional water plane (WaterMesh) — only built when
    // config.waterEnabled (per-project opt-in; most projects have none),
    // so toggling it on/off is a mount-time decision, same as
    // sectionCapStencilEnabled. Auto-sized/positioned like
    // webgl_shaders_ocean.html's own Water (no placement fields — see
    // WATER_PLANE_SIZE's doc comment). The normals texture is the actual
    // asset the reference demo loads (`textures/waternormals.jpg`),
    // vendored into `public/textures/` rather than re-approximated with a
    // procedural canvas gradient — this is exactly the kind of hand-
    // authored tiling detail a gradient can't reproduce.
    if (config.waterEnabled) {
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
      scene.add(waterMesh);
      this.waterMesh = waterMesh;
    } else {
      this.waterMesh = null;
    }

    this.pickable = new Map();
    this.unitMeshes = new Map();
    this.shells = [];
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

      for (const b of layout.buildings) {
        const shell = new THREE.Mesh(
          new THREE.BoxGeometry(b.width + 0.4, b.height + 0.4, b.depth + 0.4),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false })
        );
        shell.position.set(b.centerX, b.height / 2, b.z);
        shell.userData.isShell = true;
        clippingGroup.add(shell);
        this.shells.push(shell);
      }

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      for (const unitBox of layout.units) {
        const material = new THREE.MeshStandardMaterial({
          // Initial seed color for the very first frame — refreshAppearance
          // (called right after mount by every real caller) immediately
          // overwrites this via applyUnitAppearance/resolveUnitColors, but
          // seeding it correctly avoids a one-frame flash of the wrong
          // color on projects with custom status colors.
          color: this.resolveUnitColors()[unitBox.unit.status] ?? this.resolveUnitColors().available,
          roughness: 0.6,
          metalness: 0.05,
        });
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
          if (obj instanceof THREE.Mesh && obj.userData.isShell) {
            (obj.material as THREE.Material).dispose();
          }
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
    sun.shadow.camera.near = Math.max(0.1, boundingRadius * 0.05);
    sun.shadow.camera.far = boundingRadius * 6;
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

    const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
    this.shells.forEach((shell) => (shell.visible = showShells));
    scene.fog = config.fogEnabled ? new THREE.FogExp2(this.resolveFogColor(config), config.fogDensity) : null;

    this.rebuildEnvironment(config);
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
      constructionProgressPercent: params.constructionProgressPercent,
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
      if (this.renderPipeline) this.renderPipeline.render();
      else renderer.render(scene, camera);
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
    this.mountToken++; // invalidates any in-flight mount()/setHdri() continuations
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
    this.sectionCapMaterial?.dispose();
    this.sectionCapMaterial = null;
    this.sectionCapMaterialSignature = null;
    this.sectionCapMesh = null;
    this.clearStencilMarking();
    // Plain `ClippingGroup`s (Group subclass) — no GPU resources of their
    // own, same as `sectionHelperGroup`/`clippingGroup` right below;
    // discarded along with the scene, just null the references.
    this.stencilMarkClippingGroup = null;
    this.sectionCapClippingGroup = null;
    this.clippingGroup = null;
    this.sectionHelperGroup = null;
    this.liveSection = null;
    this.activeSectionId = null;
    this.disposeGeometry?.();
    this.dracoLoader?.dispose();
    this.envRenderTarget?.dispose();
    this.pmrem?.dispose();
    this.hdriTexture?.dispose();
    this.hdriTexture = null;
    this.hdriUrlLoaded = null;
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    // Sky/Water/Bloom/Clouds pass — bloomNode owns its own internal blur/
    // composite render targets (see BloomNode.js's own dispose()); holding
    // a direct reference here disposes them explicitly rather than relying
    // on renderPipeline's teardown to reach into the node graph.
    this.bloomNode?.dispose();
    this.bloomNode = null;
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
    // LensflareMesh's own dispose() already disposes every element's
    // texture (see LensflareMesh.js's own `this.dispose` — iterates
    // `elements[i].texture.dispose()`) — no separate texture cleanup
    // needed here.
    this.lensflare?.dispose();
    this.lensflare = null;
    this.lightProbeCubeTarget?.dispose();
    this.lightProbeCubeTarget = null;
    this.lightProbe = null; // no GPU resource of its own beyond what scene teardown already frees
    this.lightProbeToken++; // belt-and-suspenders alongside mountToken++ already invalidating in-flight work
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
    this.setProject(params.project);
    this.config = params.config;
    const { project, config, detailModels, usingGlb } = params;

    if (this.ground) this.ground.visible = config.groundEnabled;
    const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
    this.shells.forEach((shell) => (shell.visible = showShells));
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
    // waterMesh/bloomNode, so these drag live with no pipeline rebuild;
    // only the `waterEnabled`/`bloomEnabled` toggles themselves need a
    // fresh mount (they change what exists, not just a number on it —
    // same distinction `antialiasEnabled` already draws against a plain
    // uniform tweak).
    if (this.waterMesh) {
      this.waterMesh.distortionScale.value = config.waterDistortionScale;
      this.waterMesh.size.value = config.waterSize;
    }
    if (this.bloomNode) {
      this.bloomNode.strength.value = config.bloomStrength;
      this.bloomNode.radius.value = config.bloomRadius;
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

  /** Real geographic sun + sky/environment — recomputed whenever the
   * effective time-of-day, sky preset, environment intensity, north
   * rotation or manual-sun fields change. */
  applySunAndEnvironment(params: SunEnvironmentParams) {
    this.setProject(params.project);
    this.config = params.config;
    const { project, config, effectiveTimeOfDay } = params;
    const sun = this.sun;
    const ambient = this.ambient;
    const scene = this.scene;
    if (!sun || !ambient || !scene) return;

    // Manual sun (Task 2 — Track A): admin sets azimuth/elevation directly
    // instead of it being derived from date/time/lat/lng. Reuses the same
    // sunDirectionVector/sunColorForElevation pure functions calcSunPosition's
    // own result already flows through — only the position itself is
    // sourced differently. "geographic" (default) is byte-for-byte the
    // same behavior as before this feature existed.
    // Sun & Time restructure — `simulationDate` ("YYYY-MM-DD") lets an
    // admin pin the geographic sun to a specific calendar date (a solar
    // study for "21 June", say) instead of always tracking today's real
    // date. `null`/unset (the default) is byte-for-byte the same
    // `new Date()` behavior as before this field existed. Parsed at
    // UTC midnight — only the month/day feeds the seasonal declination
    // (see sunPosition.ts's dayOfYearUTC), the time-of-day component is
    // irrelevant here since `effectiveTimeOfDay` supplies the clock time
    // separately. An invalid/unparsable string falls back to "today"
    // rather than feeding calcSunPosition a NaN date.
    const simulationDate = config.simulationDate ? new Date(`${config.simulationDate}T00:00:00Z`) : null;
    const effectiveDate = simulationDate && !Number.isNaN(simulationDate.getTime()) ? simulationDate : new Date();

    const sunPos =
      config.sunMode === "manual"
        ? { elevationDeg: config.sunElevationDeg, azimuthDeg: config.sunAzimuthDeg, isNight: config.sunElevationDeg <= 0 }
        : calcSunPosition({
            lat: project.coords.lat,
            lng: project.coords.lng,
            date: effectiveDate,
            timeOfDay: effectiveTimeOfDay,
            northRotationDeg: config.northRotationDeg,
          });
    const dir = sunDirectionVector(sunPos);
    const distance = 200;
    // Used to only apply under "manual" sun mode (geographic mode ignored
    // it entirely) — now applies either way so the Lighting tab's Sun
    // Intensity slider is meaningful regardless of mode. Defaults to 1, so
    // every existing project's geographic-mode behavior is unchanged until
    // an admin actually touches the slider.
    const intensityMultiplier = config.sunIntensity;
    // Offset by the scene's actual center (same point `sun.target` was
    // pointed at, once, in mount()) — real bug fix found during the Sun &
    // Time restructure. `sun.position` used to be set in raw world space
    // with no such offset, so the light's true direction (position -
    // target) only matched the intended elevation/azimuth when the scene
    // happened to sit near the world origin; any building whose bounding-
    // box center was offset from (0,0,0) was getting a subtly wrong sun
    // angle. Falls back to the origin if called before a mount (shouldn't
    // happen in practice — `sun`/`ambient` are both null until mount()
    // sets them, guarded by the early return above).
    const center = this.sceneCenter ?? new THREE.Vector3();
    sun.position.set(
      center.x + dir.x * distance,
      center.y + Math.max(dir.y, 0.05) * distance,
      center.z + dir.z * distance
    );
    sun.color.setHex(sunColorForElevation(sunPos.elevationDeg));
    sun.intensity = (sunPos.isNight ? 0.1 : 1.2 + Math.max(0, sunPos.elevationDeg / 90) * 1.8) * intensityMultiplier;
    ambient.intensity = sunPos.isNight ? 0.08 : 0.15;
    // Below-horizon sun shouldn't show a flare from a light source that
    // isn't visibly up — same isNight signal sun.intensity already uses.
    if (this.lensflare) this.lensflare.visible = config.lensflareEnabled && !sunPos.isNight;

    // Sky/Water/Bloom/Clouds pass — feeds the same real sun direction into
    // the physical sky dome and water plane, exactly like
    // webgl_shaders_ocean.html's own `updateSun()` feeds one `sun` Vector3
    // into both `sky`/`water`. Kept raw/unclamped (unlike `sun.position`'s
    // `Math.max(dir.y, 0.05)` above, a practical floor so the *light*
    // never comes from below ground) so sunrise/sunset coloring on the sky
    // dome itself still looks correct at low sun angles. All of this is
    // cheap uniform writes — safe to run every tick alongside the rest of
    // this method; only the PMREM capture below is debounced.
    this.sunDirection.set(dir.x, dir.y, dir.z);
    if (this.skyMesh) {
      const physical = SKY_PHYSICAL_PARAMS[config.skyPreset];
      this.skyMesh.turbidity.value = physical.turbidity;
      this.skyMesh.rayleigh.value = physical.rayleigh;
      this.skyMesh.mieCoefficient.value = physical.mieCoefficient;
      this.skyMesh.mieDirectionalG.value = physical.mieDirectionalG;
      this.skyMesh.sunPosition.value.copy(this.sunDirection);
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
    // synchronously on every call, so a live-drag time/date scrubber
    // tracks the pointer smoothly. `rebuildEnvironment` below is the
    // expensive part (PMREM.fromEquirectangular + an optional light-probe
    // cube capture) — debounced so a drag doesn't thrash the GPU on every
    // tick, see scheduleEnvironmentRebuild.
    this.scheduleEnvironmentRebuild(config);
  }

  /** Debounces `rebuildEnvironment` (PMREM + light-probe rebuild) behind
   * ~150ms of idle after the last call — `applySunAndEnvironment`'s own
   * React effect re-runs on every time-of-day slider tick, and before this
   * existed each tick triggered a full synchronous PMREM regeneration.
   * Mirrors EditorShell.tsx's `syncSectionGizmo` debounce idiom.
   * `mountTokenAtStart` guards against the timer outliving a
   * dispose()/remount and firing `rebuildEnvironment` against a torn-down
   * scene (same pattern `captureLightProbe` already uses). Mount-time and
   * `setHdri`'s own `rebuildEnvironment` calls stay direct/synchronous —
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
    if (this.clippingGroup) this.clippingGroup.clippingPlanes = section ? buildSectionPlanes(section) : [];
    this.rebuildSectionCap(section);
  }

  /** Every real `THREE.Mesh` currently in `clippingGroup` — the actual
   * clippable content (GLB roots and/or procedural ground/shells/unit
   * boxes), traversed recursively since a GLB root is a nested hierarchy,
   * not a flat list. This is the geometry the stencil cap technique marks
   * against — deliberately NOT a synthetic proxy box, so the cap only
   * lights up where real geometry was actually cut open, not the
   * section's full authored rectangle (see rebuildSectionCap's stencil
   * branch). */
  private collectStencilableMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.clippingGroup?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
    });
    return meshes;
  }

  private clearStencilMarking() {
    // Marking meshes live inside `stencilMarkClippingGroup`, not
    // `sectionHelperGroup` directly (see that field's doc comment) — fall
    // back to removing from `helpers` too in case a mesh somehow ended up
    // there (defensive, `remove()` is a no-op for a non-child).
    const parent = this.stencilMarkClippingGroup ?? this.sectionHelperGroup;
    for (const mesh of this.stencilMarkMeshes) {
      parent?.remove(mesh);
      this.sectionHelperGroup?.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.stencilMarkMeshes = [];
  }

  /** Real behavior, not just a color swap (see `Section.fillGapsEnabled`'s
   * own doc comment for the full contract):
   * - `fillGapsEnabled: true` — opaque, admin-picked `fillColor`, rendered
   *   in both the editor and the public viewer.
   * - `fillGapsEnabled: false` — a translucent (50%) neutral "clip plane
   *   indicator" in the admin editor only; skipped entirely (no mesh at
   *   all, not just alpha'd to invisible) in the public viewer, since
   *   it's a pure editing aid a visitor has no use for.
   *
   * `config.sectionCapStencilEnabled` (real, experimental, off by
   * default — webgl_clipping_stencil.html technique, requires
   * `stencil: true` on the renderer, set once at mount()) swaps the
   * cap's *silhouette source* only — every color/opacity/visibility rule
   * above still applies unchanged. Technique, reconstructed from the
   * actual upstream three.js example source (verified constant names/
   * stencil op values against it, not guessed): for the section's own
   * "top" plane (`buildSectionPlanes(section)[4]` — see that function's
   * own doc comment for the fixed plane order), render every real
   * clippable object's own back faces (incrementing the stencil buffer)
   * then front faces (decrementing), each pass clipped by *only* that
   * one top plane and with color/depth writes off — the standard
   * increment/decrement parity trick, netting a nonzero stencil value
   * exactly where solid geometry was actually cut open at that plane.
   * The existing flat cap quad is then stencil-tested (`NotEqualStencilFunc`,
   * ref 0) instead of drawn unconditionally, and clipped by every *other*
   * section plane (bounding it to the footprint, exactly matching the
   * upstream example's own `planes.filter(p => p !== plane)` pattern for
   * its cap) — so it only shows within the stencil-marked, real-geometry
   * silhouette, not the section's full authored rectangle.
   *
   * **Real bug fixed 2026-08-14** ("gaps that are clipped does not fill
   * with color"): the "clipped by only that one top plane" / "clipped by
   * every other section plane" parts above were never actually true —
   * this used to set `clippingPlanes` directly on each material, which
   * has zero consumers anywhere in this app's WebGPURenderer pipeline
   * (grepped the full renderer/nodes source tree to confirm; only
   * `ClippingGroup` traversal is ever read — same lesson
   * `rozaris-3d-sections-module`'s original build already learned for the
   * *main* clip, silently reintroduced when this stencil technique was
   * added later). Unclipped, a closed/watertight source mesh's back/front
   * faces always pair up 1:1, so the increment/decrement marking passes
   * netted to exactly 0 everywhere — the cap's stencil test failed
   * everywhere, rendering nothing. Fixed with two real `ClippingGroup`s
   * (`stencilMarkClippingGroup`/`sectionCapClippingGroup`), the same
   * mechanism the main clip already uses. */
  private rebuildSectionCap(section: Section | null) {
    const helpers = this.sectionHelperGroup;
    if (!helpers) return;
    if (this.sectionCapMesh) {
      // The cap can have been parented to either `helpers` directly
      // (non-stencil mode) or `sectionCapClippingGroup` (stencil mode) on
      // the previous rebuild — remove from both, `remove()` is a no-op
      // for a non-child.
      helpers.remove(this.sectionCapMesh);
      this.sectionCapClippingGroup?.remove(this.sectionCapMesh);
      this.sectionCapMesh.geometry.dispose();
      this.sectionCapMesh = null;
    }
    this.clearStencilMarking();
    if (!section) return;
    if (!section.fillGapsEnabled && !this.isEditorPreview) return;

    const stencilMode = this.config.sectionCapStencilEnabled;
    const geometry = buildSectionCapGeometry(section);
    const color = section.fillGapsEnabled ? section.fillColor : SECTION_INDICATOR_COLOR;
    const opacity = section.fillGapsEnabled ? 1 : 0.5;
    // Real bug fix ("Fill gaps with color" reported as rendering solid
    // black): `transparent` used to be hardcoded `true` forever, for both
    // the translucent indicator AND the fully-opaque fill — contradicting
    // this method's own stated intent one line below ("should still
    // occlude/sort like solid geometry"). A fully-opaque fill now
    // genuinely renders through the OPAQUE pass like real geometry
    // (`transparent: false`), matching `depthWrite` below; only the
    // translucent indicator stays in the transparent/blended pass.
    const transparent = !section.fillGapsEnabled;
    if (!this.sectionCapMaterial) {
      this.sectionCapMaterial = new THREE.MeshBasicMaterial({ color, transparent, opacity, side: THREE.DoubleSide });
    } else {
      this.sectionCapMaterial.color.set(color);
      this.sectionCapMaterial.opacity = opacity;
      this.sectionCapMaterial.transparent = transparent;
    }
    // A fully-opaque real fill should still occlude/sort like solid
    // geometry; the translucent indicator disables depth-write (standard
    // practice for see-through helpers, avoids z-fighting/occlusion
    // artifacts against whatever it's overlapping).
    this.sectionCapMaterial.depthWrite = section.fillGapsEnabled;

    if (stencilMode) {
      const planes = buildSectionPlanes(section);
      const topPlane = planes[4];
      const otherPlanes = [...planes.slice(0, 4), ...planes.slice(5)];
      // Real bug fix — see `sectionCapClippingGroup`'s field doc comment:
      // `Material.clippingPlanes` has zero consumers in this app's
      // WebGPURenderer pipeline, confirmed by reading the actual installed
      // source. Bounding the cap's flat quad to the section's other
      // (non-top) planes now goes through a real `ClippingGroup`, the
      // same mechanism `this.clippingGroup` already proves works.
      if (!this.sectionCapClippingGroup) {
        this.sectionCapClippingGroup = new THREE.ClippingGroup();
        helpers.add(this.sectionCapClippingGroup);
      }
      this.sectionCapClippingGroup.clippingPlanes = otherPlanes;
      this.sectionCapMaterial.stencilWrite = true;
      this.sectionCapMaterial.stencilRef = 0;
      this.sectionCapMaterial.stencilFunc = THREE.NotEqualStencilFunc;
      this.sectionCapMaterial.stencilFail = THREE.ReplaceStencilOp;
      this.sectionCapMaterial.stencilZFail = THREE.ReplaceStencilOp;
      this.sectionCapMaterial.stencilZPass = THREE.ReplaceStencilOp;

      // Same real bug fix for the marking pair — without a genuine
      // `[topPlane]` clip, a closed/watertight source mesh's back/front
      // faces always pair up 1:1 (every ray crosses equal counts of each),
      // so the increment/decrement passes net to exactly 0 everywhere and
      // the cap's `NotEqualStencilFunc` test fails everywhere — this is
      // the actual mechanism behind "gaps that are clipped does not fill
      // with color."
      if (!this.stencilMarkClippingGroup) {
        this.stencilMarkClippingGroup = new THREE.ClippingGroup();
        helpers.add(this.stencilMarkClippingGroup);
      }
      this.stencilMarkClippingGroup.clippingPlanes = [topPlane];

      for (const source of this.collectStencilableMeshes()) {
        const backMat = new THREE.MeshBasicMaterial({
          side: THREE.BackSide,
          colorWrite: false,
          depthWrite: false,
          depthTest: false,
          stencilWrite: true,
          stencilFunc: THREE.AlwaysStencilFunc,
          stencilFail: THREE.IncrementWrapStencilOp,
          stencilZFail: THREE.IncrementWrapStencilOp,
          stencilZPass: THREE.IncrementWrapStencilOp,
        });
        const frontMat = backMat.clone();
        frontMat.side = THREE.FrontSide;
        frontMat.stencilFail = THREE.DecrementWrapStencilOp;
        frontMat.stencilZFail = THREE.DecrementWrapStencilOp;
        frontMat.stencilZPass = THREE.DecrementWrapStencilOp;
        const backMesh = new THREE.Mesh(source.geometry, backMat);
        const frontMesh = new THREE.Mesh(source.geometry, frontMat);
        // Shares source's world transform directly rather than
        // re-parenting (source stays exactly where it is, inside
        // clippingGroup) — sectionHelperGroup sits at identity at the
        // scene root, so copying world-space matrixWorld straight into
        // local .matrix (with matrixAutoUpdate off, so nothing overwrites
        // it) reproduces the same placement. `stencilMarkClippingGroup`
        // (their real parent, added to `helpers` above) also sits at
        // identity, so this world-space copy is still valid one level
        // deeper.
        backMesh.matrixAutoUpdate = false;
        frontMesh.matrixAutoUpdate = false;
        backMesh.matrix.copy(source.matrixWorld);
        frontMesh.matrix.copy(source.matrixWorld);
        backMesh.frustumCulled = false;
        frontMesh.frustumCulled = false;
        // Must render before the cap (renderOrder 10 below), so the
        // stencil buffer is fully written before the cap reads it.
        backMesh.renderOrder = 9;
        frontMesh.renderOrder = 9;
        this.stencilMarkClippingGroup.add(backMesh, frontMesh);
        this.stencilMarkMeshes.push(backMesh, frontMesh);
      }
    } else {
      // Explicit reset — this.sectionCapMaterial is reused across
      // rebuilds (see the color/opacity update above), so a project that
      // had stencil mode on and then off must not keep stale stencil
      // state from a previous rebuild. (`sectionCapClippingGroup`'s
      // planes don't need resetting — the cap goes straight into
      // `helpers` below when not in stencil mode, bypassing that group
      // entirely.)
      this.sectionCapMaterial.stencilWrite = false;
    }
    // Real bug fix, same "Fill gaps with color" report: this material is
    // reused across rebuilds (every mutation above is an in-place property
    // write, not a `new THREE.MeshBasicMaterial(...)`), but nothing ever
    // told the renderer its *pipeline-affecting* state (transparent/
    // depthWrite/stencilWrite/clippingPlanes) had changed. Verified
    // against the installed three.js WebGPU backend
    // (node_modules/three/src/renderers/common/RenderObjects.js:127):
    // a cached render object/pipeline is only rebuilt when
    // `material.version` has advanced past what it was compiled with, and
    // `material.version` only advances when `needsUpdate` is explicitly
    // set `true` (Material.js's setter). Without this, toggling "Fill
    // gaps with a color" on/off could keep rendering through a stale
    // pipeline compiled for whichever state (translucent-indicator vs.
    // opaque-fill) this exact material instance happened to compile for
    // first — a real, plausible cause of a fill that renders wrong
    // (including solid black) instead of the picked color.
    //
    // Only bumped when the signature actually changed, not on every call
    // — this method also runs on every gizmo-drag tick (pure move/rotate/
    // resize), where fill/stencil state is unchanged from the previous
    // call; forcing a pipeline rebuild every frame of a drag would be real
    // wasted GPU work for no visual benefit.
    const signature = `${transparent}|${section.fillGapsEnabled}|${stencilMode}`;
    if (signature !== this.sectionCapMaterialSignature) {
      this.sectionCapMaterialSignature = signature;
      this.sectionCapMaterial.needsUpdate = true;
    }

    const mesh = new THREE.Mesh(geometry, this.sectionCapMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Draws after the clipped geometry (and, in stencil mode, after its
    // own marking pair above) so it doesn't z-fight with whatever real
    // geometry the cut happens to graze exactly at heightM.
    mesh.renderOrder = 10;
    // Stencil mode parents through `sectionCapClippingGroup` (bounds the
    // quad to the section's other planes, a real ClippingGroup — see that
    // field's doc comment); non-stencil mode's geometry is already sized
    // exactly to widthM×depthM, so it goes straight into `helpers`
    // unclipped, same as before this fix.
    if (stencilMode && this.sectionCapClippingGroup) {
      this.sectionCapClippingGroup.add(mesh);
    } else {
      helpers.add(mesh);
    }
    this.sectionCapMesh = mesh;
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
      widthM: Math.max(0.5, anchor.scale.x),
      depthM: Math.max(0.5, anchor.scale.z),
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
