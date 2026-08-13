import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { metalness, mrt, normalView, output, pass, roughness } from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { applyUnitBoxMaterial, disposeGlbObject3D } from "@/lib/glbUnitNodes";
import { calcSunPosition, sunColorForElevation, sunDirectionVector } from "@/lib/sunPosition";
import {
  ADAPTIVE_DOWNGRADE_ORDER,
  GLASS_NODE_PATTERN,
  GLASS_TIERS,
  GROUND_COLOR,
  MATERIAL_PRESETS,
  QUALITY_TIERS,
  SELECTED_COLOR,
  SKY_GRADIENTS,
  UNIT_BOX_COLOR,
  UNIT_BOX_OPACITY,
  UNIT_BOX_SELECTED_OPACITY,
  UNIT_BOX_XRAY_OPACITY_BOOST,
  VIEW_PRESET_MATERIAL,
  type QualityTierSettings,
  type ViewPreset,
} from "@/lib/viewerPresets";
import type { CameraPreset, Project, Project3DConfig, ProjectDetailModel, Unit, UnitMeshLink } from "@/lib/types";

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
}

export interface MountParams {
  project: Project;
  config: Project3DConfig;
  detailModel: ProjectDetailModel | null;
  usingGlb: boolean;
  /** Whatever the component's viewPreset/xray/selection/filter state
   * happens to be at the moment this particular mount runs — matches the
   * original component's setup() closing over that render's ENTIRE
   * props/state (not necessarily today's live values; the very next
   * `applyLiveUpdate`/`refreshAppearance` call re-applies with fresh ones
   * once `ready`, same two-pass behavior as before). Also doubles as the
   * initial `refreshAppearance` call at the end of mount() — see there. */
  viewPreset: ViewPreset;
  xrayEnabled: boolean;
  xrayFacadeOpacity: number;
  selectedUnitId: string | null;
  filters: UnitFilters;
  constructionProgressPercent: number | undefined;
  showUnitBoxes: boolean;
}

export interface LiveUpdateParams {
  project: Project;
  config: Project3DConfig;
  detailModel: ProjectDetailModel | null;
  usingGlb: boolean;
  viewPreset: ViewPreset;
  xrayEnabled: boolean;
  xrayFacadeOpacity: number;
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
  viewPreset: ViewPreset;
  constructionProgressPercent: number | undefined;
  showUnitBoxes: boolean;
  xrayEnabled: boolean;
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
  private sun: THREE.DirectionalLight | null = null;
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
  private unitEdges = new Map<string, THREE.LineSegments>();
  private shells: THREE.Mesh[] = [];
  private unitBoxes: UnitBox[] = [];

  // GLB mode
  private glbRoot: THREE.Group | null = null;
  private glbUnitBoxes = new Map<string, GlbUnitBoxEntry>();

  private pickable = new Map<string, THREE.Object3D>();
  private hoveredId: string | null = null;
  private defaultCamera: { position: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;

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
    params: { selectedUnitId: string | null; viewPreset: ViewPreset; filters: UnitFilters; constructionProgressPercent: number | undefined; constructionStagesEnabled: boolean }
  ) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const isSelected = box.unit.id === params.selectedUnitId;
    const isHovered = box.unit.id === this.hoveredId;
    const preset = VIEW_PRESET_MATERIAL[params.viewPreset];
    const unitColors = this.resolveUnitColors();
    const baseColor = preset.color ?? unitColors[box.unit.status];
    material.color.setHex(isSelected ? unitColors.selected : baseColor);
    material.emissive.setHex(isSelected ? unitColors.selected : isHovered ? 0x333333 : 0x000000);
    material.emissiveIntensity = isSelected ? 0.35 : isHovered ? 0.5 : 0;
    material.roughness = preset.roughness;
    material.metalness = preset.metalness;

    const progress = params.constructionProgressPercent ?? this.project.progressPercent;
    const isBuilt =
      !params.constructionStagesEnabled ||
      this.project.status !== "under_construction" ||
      box.floorIndex / Math.max(1, box.totalFloorsInBuilding) <= progress / 100;
    const visible = this.matchesFilters(box.unit, params.filters) && isBuilt;
    mesh.visible = visible;

    const edges = this.unitEdges.get(box.unit.id);
    if (edges) {
      edges.visible = visible && preset.edges;
      (edges.material as THREE.LineBasicMaterial).opacity = preset.edgeOpacity;
    }
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

  private refreshGlbUnitBoxAppearance(params: { selectedUnitId: string | null; filters: UnitFilters; showUnitBoxes: boolean; xrayEnabled: boolean }) {
    const unitColors = this.resolveUnitColors();
    this.glbUnitBoxes.forEach(({ node, unitId }) => {
      const unit = this.unitById.get(unitId);
      if (!unit) {
        node.visible = false;
        return;
      }
      const isSelected = unitId === params.selectedUnitId;
      const isHovered = unitId === this.hoveredId;
      // X-Ray forces boxes visible even with the Unit Search panel closed —
      // fading the facade to see nothing behind it would defeat the point.
      node.visible = (params.showUnitBoxes || params.xrayEnabled) && this.matchesFilters(unit, params.filters);
      const color = isSelected ? unitColors.selected : unitColors[unit.status];
      const baseOpacity = isSelected || isHovered ? UNIT_BOX_SELECTED_OPACITY : UNIT_BOX_OPACITY;
      const opacity = params.xrayEnabled ? Math.min(1, baseOpacity + UNIT_BOX_XRAY_OPACITY_BOOST) : baseOpacity;
      // Color is now part of the cache key (was status|selected|hovered|
      // xray only) — an admin changing a status color mid-session must
      // produce a fresh cache entry, not silently reuse a stale-colored
      // cached material. Old-color entries become orphaned in the Map
      // until the next full mount() rebuild (which already disposes and
      // recreates the whole cache) — acceptable for a bounded admin
      // editing session, same trade-off already accepted for the cache's
      // hover/select dimensions.
      const cacheKey = `${unit.status}|${isSelected}|${isHovered}|${params.xrayEnabled}|${color}`;
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
        xrayEnabled: params.xrayEnabled,
      });
    } else {
      this.unitBoxes.forEach((box) => {
        const mesh = this.unitMeshes.get(box.unit.id);
        if (mesh) {
          this.applyUnitAppearance(mesh, box, {
            selectedUnitId: params.selectedUnitId,
            viewPreset: params.viewPreset,
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
  private applyDetailUnitLinks(root: THREE.Object3D, unitLinks: UnitMeshLink[]) {
    const linkByName = new Map(unitLinks.map((l) => [l.meshName, l.unitId]));
    this.glbUnitBoxes.forEach(({ node }, meshName) => {
      if (!linkByName.has(meshName)) node.visible = !UNIT_NODE_PATTERN.test(meshName);
    });
    this.glbUnitBoxes.clear();
    this.pickable.clear();
    root.traverse((child) => {
      const unitId = linkByName.get(child.name);
      if (!unitId) {
        if (UNIT_NODE_PATTERN.test(child.name)) child.visible = false;
        return;
      }
      child.visible = false;
      child.userData.unitId = unitId;
      this.glbUnitBoxes.set(child.name, { node: child, unitId });
      this.pickable.set(unitId, child);
    });
  }

  private applyGlbMaterialPreset(root: THREE.Object3D, viewPreset: ViewPreset, xrayEnabled: boolean, xrayFacadeOpacity: number) {
    const preset = VIEW_PRESET_MATERIAL[viewPreset];
    const unitBoxNodes = new Set(Array.from(this.glbUnitBoxes.values()).map((e) => e.node));
    root.traverse((child) => {
      if (unitBoxNodes.has(child)) return;
      if (GLASS_NODE_PATTERN.test(child.name)) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => {
        const std = mat as THREE.MeshStandardMaterial;
        if (preset.color != null) std.color?.setHex(preset.color);
        if (typeof std.roughness === "number") std.roughness = preset.roughness;
        if (typeof std.metalness === "number") std.metalness = preset.metalness;
        // X-Ray: fades everything that isn't a unit box or glass down to a
        // low, admin/buyer-adjustable opacity so units behind the facade
        // read through it.
        std.transparent = xrayEnabled;
        std.opacity = xrayEnabled ? xrayFacadeOpacity : 1;
        std.depthWrite = !xrayEnabled;
        // Toggling `.transparent` changes the material's blend/compile
        // state — unlike color/roughness/metalness, this needs an explicit
        // recompile flag or three.js can keep rendering the old (opaque)
        // blend mode.
        std.needsUpdate = true;
      });
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
   * applyGlbMaterialPreset/applyGlassPreset so it customizes specific
   * nodes on top of their baseline treatment, not the other way round.
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

  private rebuildEnvironment(config: Project3DConfig) {
    const renderer = this.renderer;
    const scene = this.scene;
    const pmrem = this.pmrem;
    if (!renderer || !scene || !pmrem) return;
    // Platform HDRI takes over from the procedural gradient once loaded
    // (see setHdri below) — same PMREM path either way, so reflections/
    // background/environment intensity all keep working identically
    // regardless of which source the equirect texture came from. Only
    // dispose the gradient texture (a throwaway CanvasTexture built fresh
    // every call) — the HDRI texture is cached and owned by this.hdriTexture.
    const usingHdri = !!this.hdriTexture;
    const skyTexture = usingHdri ? this.hdriTexture! : this.buildSkyTexture(config.skyPreset);
    const renderTarget = pmrem.fromEquirectangular(skyTexture);
    if (!usingHdri) skyTexture.dispose();
    this.envRenderTarget?.dispose();
    this.envRenderTarget = renderTarget;
    // Environment lighting/reflections always come from the sky PMREM,
    // regardless of backgroundPreset — only the visible backdrop changes.
    scene.environment = renderTarget.texture;
    scene.environmentIntensity = config.environmentIntensity;
    if (config.backgroundPreset === "sky") {
      scene.background = renderTarget.texture;
      scene.backgroundIntensity = config.environmentIntensity;
    } else {
      scene.background = new THREE.Color(config.backgroundPreset === "studio_dark" ? 0x141414 : 0xf0efe9);
      scene.backgroundIntensity = 1;
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
   * pipeline/output-node manager) over a single MRT-enabled scene pass
   * (color + depth + normal — GTAO/SSR both need the normal buffer, so
   * it's requested unconditionally rather than conditionally per tier).
   * Wrapped in try/catch: a construction failure degrades to "no
   * post-processing" (renderPipeline stays null, the render loop falls
   * back to a plain renderer.render(scene, camera)) rather than breaking
   * the viewer outright. */
  private buildRenderPipeline(tier: QualityTierSettings) {
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return;
    try {
      const scenePass = pass(scene, camera);
      // metalness/roughness channels are only needed for SSR — always
      // requesting them costs one more MRT attachment even on tiers where
      // ssr is off, but keeping setMRT's shape identical across tiers
      // avoids a pipeline rebuild edge case when a runtime adaptive
      // downgrade flips `tier.ssr` without a full remount.
      scenePass.setMRT(mrt({ output, normal: normalView, metalness, roughness }));
      const color = scenePass.getTextureNode("output");
      const depth = scenePass.getTextureNode("depth");
      const normal = scenePass.getTextureNode("normal");

      // AO darkens ambient-occluded areas of the base color first, SSR
      // then blends screen-space reflections into that (so a reflection's
      // own content isn't additionally darkened by the *reflecting*
      // surface's local AO), Bloom adds a glow from bright regions on top
      // of the combined result, SMAA anti-aliases last — applied
      // separately below since @types/three's SMAANode doesn't unify with
      // this chain's Node<"vec4"> typing.
      let chain: THREE.Node<"vec4"> = color;
      // NOT `normal.xyz` here, on purpose: both GTAONode and SSRNode call
      // `this.normalNode.sample(uv).rgb` internally (ray-marching needs to
      // re-sample the normal buffer at arbitrary UVs, not just the current
      // pixel) — `.sample()` only exists on the raw TextureNode. Swizzling
      // to `.xyz` first (done in an earlier pass to satisfy this call's
      // `Node<"vec3">` typing) returns a SwizzleNode with no `.sample()`,
      // which threw `this.normalNode.sample is not a function` on every
      // frame — the actual cause of the still-black viewer after the
      // metalness/roughness fix. The type cast below is the honest fix:
      // @types/three's declared `Node<"vec3">` param doesn't capture that
      // these two effects specifically require the unswizzled TextureNode.
      const normalTex = normal as unknown as THREE.Node<"vec3">;
      // SSR run BEFORE GTAO now (was AO-then-SSR) — a third instance of the
      // same constraint as the normal-buffer fix above: SSRNode also does
      // `this.colorNode.sample(uv)` internally, which requires the raw
      // scene-pass color TextureNode, not an already-composited chain
      // (`chain.mul(aoResult)` is a MathNode with no `.sample()`). Feeding
      // it the post-AO chain threw `this.colorNode.sample is not a
      // function`, the third and final cause of the black viewer. Trade-off
      // versus the original AO-first ordering: a reflection's own pixels
      // are now also darkened by the reflecting surface's local AO term,
      // which the original comment specifically wanted to avoid — accepted
      // for now to get a correctly-rendering pipeline; revisit only if it's
      // visibly wrong once someone can actually look at it.
      // Real per-project overrides (full-configurator pass), ANDed with —
      // not replacing — the tier's own flag. tier.ssr/tier.gtao are
      // force-false on every QUALITY_TIERS entry right now (see that
      // file's header comment — two unexplained real-GPU rendering
      // failures in this exact chain), so these three toggles are
      // currently inert regardless of what an admin sets; the wiring is
      // real and correct for whenever the tier flags are safely
      // re-enabled.
      if (tier.ssr && this.config.ssrEnabled) {
        // SSRNode's own shader unconditionally does `float(this.metalnessNode)`
        // / `float(this.roughnessNode)` with no null guard — leaving these
        // options unset (their own JSDoc default) throws
        // "Cannot read properties of null (reading 'isNode')" on every
        // frame once SSR is enabled, which is what was producing a fully
        // black viewer. Real per-pixel values via the MRT channels above,
        // same "no explicit sample() needed" auto-UV binding depth/normal
        // already rely on (per SSRNode's own comment on this).
        const metalnessTex = scenePass.getTextureNode("metalness").x;
        const roughnessTex = scenePass.getTextureNode("roughness").x;
        chain = ssr(color, depth, normalTex, { camera, metalnessNode: metalnessTex, roughnessNode: roughnessTex });
      }
      if (tier.gtao && this.config.gtaoEnabled) chain = chain.mul(ao(depth, normalTex, camera));
      if (tier.bloom) chain = chain.add(bloom(chain, 0.6, 0.4, 0.85));

      const pipeline = new THREE.RenderPipeline(renderer);
      pipeline.outputNode = tier.antialias && this.config.antialiasEnabled ? smaa(chain) : chain;
      this.renderPipeline = pipeline;
    } catch (err) {
      console.error("3D Experience: post-processing pipeline failed, falling back to direct render", err);
      this.renderPipeline = null;
    }
  }

  /** One-time scene setup per project/content-mode/rendering-mode — full
   * teardown+rebuild, called by the component whenever project.id,
   * usingGlb, detailModel.glbUrl, config.renderingMode or
   * config.qualityPreset change. Cheaper config tweaks are applied
   * in-place by `applyLiveUpdate`/`applySunAndEnvironment` instead. */
  async mount(container: HTMLDivElement, params: MountParams) {
    const token = ++this.mountToken;
    this.container = container;
    this.setProject(params.project);
    this.config = params.config;
    const { config, detailModel, usingGlb, project, viewPreset, xrayEnabled, xrayFacadeOpacity } = params;

    const renderer = new THREE.WebGPURenderer({
      antialias: true,
      // "auto"/"webgpu" both let Three.js probe for WebGPU and fall back
      // to WebGL2 automatically (WebGPURenderer's own built-in
      // `getFallback`); only "webgl2" forces the WebGL2 backend outright.
      forceWebGL: config.renderingMode === "webgl2",
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(sun, sun.target, ambient);
    this.sun = sun;
    this.ambient = ambient;

    this.pickable = new Map();
    this.unitMeshes = new Map();
    this.unitEdges = new Map();
    this.shells = [];
    this.glbUnitBoxes = new Map();
    this.unitMaterialCache = new Map();

    let boundingRadius = 20;
    let centerX = 0;
    let centerY = 1;
    let centerZ = 0;

    if (usingGlb && detailModel) {
      // --- GLB content ---
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
      this.dracoLoader = dracoLoader;
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);

      let gltf;
      try {
        gltf = await loader.loadAsync(detailModel.glbUrl);
      } catch (err) {
        // Failure recovery: a bad URL/network error/corrupt file used to
        // dead-end in the same "no WebGL" error screen a genuine renderer
        // failure shows — misleading, and worse than necessary since the
        // procedural-massing fallback is one `if/else` branch away.
        // Reporting it lets the caller flip `usingGlb` off and re-mount,
        // naturally taking the `else` branch below this time.
        console.warn("3D Experience: detail GLB failed to load, falling back to procedural massing", err);
        if (token === this.mountToken) this.callbacks.onGlbLoadFailed();
        return;
      }
      if (token !== this.mountToken) return;

      const root = gltf.scene;
      this.applyDetailTransform(root, detailModel.scale, detailModel.rotationDeg, detailModel.altitudeOffset);
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      scene.add(root);
      this.glbRoot = root;

      this.applyDetailUnitLinks(root, detailModel.unitLinks as UnitMeshLink[]);

      this.applyGlbMaterialPreset(root, viewPreset, xrayEnabled, xrayFacadeOpacity);
      this.applyGlassPreset(root, config.glassPreset, config.environmentIntensity);
      this.applyNodeOverrides(root, detailModel);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      boundingRadius = Math.max(size.x, size.y, size.z) * 0.65 || 20;
      // A real uploaded GLB is very often authored off-origin (real-world
      // survey coordinates, arbitrary export origin, etc.) — using the
      // bounding box's real center here (not a hardcoded (0, y, 0)) keeps
      // the orbit pivot/shadow target locked to the actual building.
      centerX = center.x;
      centerY = center.y;
      centerZ = center.z;

      this.disposeGeometry = () => {
        scene.remove(root);
        disposeGlbObject3D(root);
      };
    } else {
      // --- Procedural massing fallback ---
      const layout = computeProjectLayout(project);
      this.unitBoxes = layout.units;
      boundingRadius = layout.boundingRadius;
      centerY = layout.centerY;

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(layout.boundingRadius * 1.6, 48),
        new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 1 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      this.ground = ground;

      for (const b of layout.buildings) {
        const shell = new THREE.Mesh(
          new THREE.BoxGeometry(b.width + 0.4, b.height + 0.4, b.depth + 0.4),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false })
        );
        shell.position.set(b.centerX, b.height / 2, b.z);
        shell.userData.isShell = true;
        scene.add(shell);
        this.shells.push(shell);
      }

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      for (const unitBox of layout.units) {
        const material = new THREE.MeshStandardMaterial({
          // Initial seed color for the very first frame — refreshAppearance
          // (called right after mount by every real caller) immediately
          // overwrites this via applyUnitAppearance/resolveUnitColors, but
          // seeding it correctly avoids a one-frame flash of the wrong
          // color on projects with custom status colors.
          color: this.resolveUnitColors()[unitBox.unit.status],
          roughness: 0.6,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(unitBox.width, unitBox.height, unitBox.depth);
        mesh.position.set(unitBox.x, unitBox.y, unitBox.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.unitId = unitBox.unit.id;
        scene.add(mesh);
        this.unitMeshes.set(unitBox.unit.id, mesh);
        this.pickable.set(unitBox.unit.id, mesh);

        const edges = new THREE.LineSegments(
          edgeGeometry,
          new THREE.LineBasicMaterial({ color: 0x2a2a33, transparent: true, opacity: 0 })
        );
        edges.visible = false;
        mesh.add(edges);
        this.unitEdges.set(unitBox.unit.id, edges);
      }

      this.disposeGeometry = () => {
        geometry.dispose();
        edgeGeometry.dispose();
        this.unitMeshes.forEach((mesh) => (mesh.material as THREE.Material).dispose());
        this.unitEdges.forEach((edges) => (edges.material as THREE.Material).dispose());
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.geometry !== geometry) obj.geometry.dispose();
          if (obj instanceof THREE.Mesh && obj.userData.isShell) {
            (obj.material as THREE.Material).dispose();
          }
        });
        (ground.material as THREE.Material).dispose();
        ground.geometry.dispose();
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

    if (this.ground) this.ground.visible = config.groundEnabled;
    const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
    this.shells.forEach((shell) => (shell.visible = showShells));
    scene.fog = config.fogEnabled ? new THREE.FogExp2(config.fogColor, config.fogDensity) : null;

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
      viewPreset,
      constructionProgressPercent: params.constructionProgressPercent,
      showUnitBoxes: params.showUnitBoxes,
      xrayEnabled,
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
    this.disposeGeometry?.();
    this.dracoLoader?.dispose();
    this.envRenderTarget?.dispose();
    this.pmrem?.dispose();
    this.hdriTexture?.dispose();
    this.hdriTexture = null;
    this.hdriUrlLoaded = null;
    this.renderPipeline?.dispose();
    this.renderPipeline = null;
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
    this.glbRoot = null;
    this.unitMeshes.clear();
    this.unitEdges.clear();
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
    const { project, config, detailModel, usingGlb, viewPreset, xrayEnabled, xrayFacadeOpacity } = params;

    if (this.ground) this.ground.visible = config.groundEnabled;
    const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
    this.shells.forEach((shell) => (shell.visible = showShells));
    // scene.fog is a plain, stable three.js API — cheap to update live
    // (unlike the post-processing chain), no remount needed.
    if (this.scene) {
      this.scene.fog = config.fogEnabled ? new THREE.FogExp2(config.fogColor, config.fogDensity) : null;
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
    if (this.glbRoot && detailModel) {
      // Live-reflects Admin's scale/rotation/altitude sliders and Link
      // Units edits without a full GLB reload.
      this.applyDetailTransform(this.glbRoot, detailModel.scale, detailModel.rotationDeg, detailModel.altitudeOffset);
      this.applyDetailUnitLinks(this.glbRoot, detailModel.unitLinks as UnitMeshLink[]);
      this.applyGlassPreset(this.glbRoot, config.glassPreset, config.environmentIntensity);
      this.applyGlbMaterialPreset(this.glbRoot, viewPreset, xrayEnabled, xrayFacadeOpacity);
      this.applyNodeOverrides(this.glbRoot, detailModel);
    }
    if (this.renderer) this.renderer.toneMappingExposure = config.exposure;
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
    const sunPos =
      config.sunMode === "manual"
        ? { elevationDeg: config.sunElevationDeg, azimuthDeg: config.sunAzimuthDeg, isNight: config.sunElevationDeg <= 0 }
        : calcSunPosition({
            lat: project.coords.lat,
            lng: project.coords.lng,
            date: new Date(),
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
    sun.position.set(dir.x * distance, Math.max(dir.y, 0.05) * distance, dir.z * distance);
    sun.color.setHex(sunColorForElevation(sunPos.elevationDeg));
    sun.intensity = (sunPos.isNight ? 0.1 : 1.2 + Math.max(0, sunPos.elevationDeg / 90) * 1.8) * intensityMultiplier;
    ambient.intensity = sunPos.isNight ? 0.08 : 0.15;

    this.rebuildEnvironment(config);
  }
}
