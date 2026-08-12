"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { mrt, normalView, output, pass } from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { Bath, BedDouble, Box, Camera, Home, Layers, Palette, Ruler, Search, Sun, X } from "lucide-react";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { applyUnitBoxMaterial, disposeGlbObject3D } from "@/lib/glbUnitNodes";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { usePriceFormat } from "@/hooks/usePriceFormat";
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
  STATUS_COLOR,
  TIME_PRESETS,
  UNIT_BOX_COLOR,
  UNIT_BOX_OPACITY,
  UNIT_BOX_SELECTED_OPACITY,
  UNIT_BOX_XRAY_OPACITY_BOOST,
  VIEW_PRESETS,
  VIEW_PRESET_MATERIAL,
  XRAY_DEFAULT_FACADE_OPACITY,
  type QualityTierSettings,
  type ViewPreset,
} from "@/lib/viewerPresets";
import { DarkSelect, MenuIconButton, StatusLegend, formatHour } from "./ViewerChrome";
import type { CameraPreset, Unit, UnitMeshLink } from "@/lib/types";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

type AvailabilityFilter = "all" | Unit["status"];

interface GlbUnitBoxEntry {
  node: THREE.Object3D;
  unitId: string;
}

const UNIT_NODE_PATTERN = /^Unit_/i;
const MOBILE_VIEWPORT_BREAKPOINT = 768; // matches Tailwind's `md` — used for FOV/quality only, not a full UA probe

// Same map UnitPreviewCard/UnitDetailPanel/UnitDiscoveryPanel each already
// declare locally rather than sharing one module — matching that existing
// precedent here too.
const STATUS_LABEL_KEY: Record<Unit["status"], string> = {
  available: "unit.statusAvailable",
  reserved: "unit.statusReserved",
  sold: "unit.statusSold",
};

/**
 * ROZARIS's one real "3D Experience" engine — a standalone WebGPU/WebGL2
 * canvas the app fully owns ("3D Experience Phase 1"), replacing the old
 * split between this component (procedural massing only) and
 * MapboxProjectViewer.tsx/DetailModelLayer.ts (a real GLB rendered *inside*
 * Mapbox's own shared WebGL2 context — no OrbitControls, no post-
 * processing, no WebGPU possible there). Renders either:
 *  - the procedural box-massing fallback (lib/threeBuilding.ts) for any
 *    project with no enabled detail model, or
 *  - the admin-uploaded detailed GLB (useProjectDetailModel), with its
 *    linked `Unit_<number>` boxes, once one is enabled —
 * in the SAME owned scene, camera and renderer, so real environment
 * lighting, a real geographic sun (src/lib/sunPosition.ts) and real glass
 * materials apply uniformly regardless of which content is loaded.
 */
export const ProceduralProjectViewer = forwardRef<ThreeProjectViewerHandle, ThreeProjectViewerProps>(
  function ProceduralProjectViewer(
    {
      project,
      config,
      className,
      selectedUnitId = null,
      onSelectUnit,
      constructionProgressPercent,
      showChrome = true,
      onBarOpenChange,
      showPerfStats = false,
    },
    ref
  ) {
    const detailModel = useProjectDetailModel(project.id);
    // Failure recovery: a GLB that fails to load (bad URL/network/corrupt
    // file) flips this, which turns `usingGlb` off and — since it's in
    // the setup effect's own dependency array — makes the effect
    // naturally re-run and fall back to procedural massing. Reset below
    // whenever the URL itself changes, so a freshly-published fix gets a
    // real retry instead of staying stuck in fallback mode.
    const [glbLoadFailed, setGlbLoadFailed] = useState(false);
    useEffect(() => {
      setGlbLoadFailed(false);
    }, [detailModel?.glbUrl]);
    const usingGlb = !!(detailModel?.enabled && detailModel.glbUrl) && !glbLoadFailed;

    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const envSceneRef = useRef<THREE.Scene | null>(null);
    const pmremRef = useRef<InstanceType<typeof THREE.PMREMGenerator> | null>(null);
    const envRenderTargetRef = useRef<{ texture: THREE.Texture; dispose: () => void } | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const groundRef = useRef<THREE.Mesh | null>(null);
    const sunRef = useRef<THREE.DirectionalLight | null>(null);
    const ambientRef = useRef<THREE.AmbientLight | null>(null);

    // Render/visual quality pass — TSL post-processing pipeline. Null
    // means either "not built yet" or "construction threw, fall back to
    // renderer.render() directly" (see buildRenderPipeline below) — both
    // handled identically by the render loop.
    const renderPipelineRef = useRef<InstanceType<typeof THREE.RenderPipeline> | null>(null);
    // The tier actually in effect right now — starts as a copy of the
    // admin-configured tier but the adaptive-quality sampler can flip
    // flags off on this copy under sustained low frame rate. Never
    // mutates config.qualityPreset/QUALITY_TIERS itself, so a reload
    // always starts back at Admin's real choice.
    const effectiveTierRef = useRef<QualityTierSettings>(QUALITY_TIERS[config.qualityPreset]);
    const frameTimesRef = useRef<number[]>([]);
    const lastFrameAtRef = useRef<number | null>(null);
    const downgradeStepRef = useRef(0);
    // Throttles perfStats' setState to a few times a second — see
    // samplePerfStats in the setup effect.
    const perfSampleCounterRef = useRef(0);
    // Audit fix: samplePerfStats is defined once inside the one-time
    // setup effect (not in its own dependency array — adding it there
    // would force a full renderer/scene rebuild just to toggle a debug
    // overlay), so it would otherwise close over a stale `showPerfStats`
    // prop value forever. Assigned directly in the render body (not an
    // effect) so it's always current the next time the animation loop
    // reads it.
    const showPerfStatsRef = useRef(showPerfStats);
    showPerfStatsRef.current = showPerfStats;
    // Active "jump to camera preset" animation, if any — cleared on
    // completion or the moment the user starts dragging OrbitControls.
    const cameraTransitionRef = useRef<{
      startPos: THREE.Vector3;
      startTarget: THREE.Vector3;
      endPos: THREE.Vector3;
      endTarget: THREE.Vector3;
      startFov: number;
      endFov: number;
      startTime: number;
      durationMs: number;
    } | null>(null);

    // Procedural mode
    const unitMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
    const unitEdgesRef = useRef<Map<string, THREE.LineSegments>>(new Map());
    const shellsRef = useRef<THREE.Mesh[]>([]);
    const unitBoxesRef = useRef<UnitBox[]>([]);

    // GLB mode
    const glbRootRef = useRef<THREE.Group | null>(null);
    const glbUnitBoxesRef = useRef<Map<string, GlbUnitBoxEntry>>(new Map());

    const pickableRef = useRef<Map<string, THREE.Object3D>>(new Map());
    const hoveredIdRef = useRef<string | null>(null);
    const defaultCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3; fov: number } | null>(null);

    const [ready, setReady] = useState(false);
    const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
    const [filter, setFilter] = useState<AvailabilityFilter>("all");
    const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
    const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
    const [minArea, setMinArea] = useState<number | null>(null);
    const [panel, setPanel] = useState<"search" | "time" | "viewPreset" | "xray" | "cameraPresets" | null>(null);
    const [timeOfDay, setTimeOfDay] = useState(() => config.defaultTimeOfDay);
    const [viewPreset, setViewPreset] = useState<ViewPreset>("realistic");
    const [xrayFacadeOpacity, setXrayFacadeOpacity] = useState(XRAY_DEFAULT_FACADE_OPACITY);
    const [hoveredUnit, setHoveredUnit] = useState<Unit | null>(null);
    const tooltipElRef = useRef<HTMLDivElement>(null);
    // Performance inspector (Publish/runtime hardening pass) — admin-only,
    // gated by showPerfStats not showChrome (see viewerTypes.ts). Updated
    // from the animation loop but throttled (see perfSampleCounterRef in
    // the setup effect) rather than every frame, to avoid a React
    // re-render at full frame rate.
    const [perfStats, setPerfStats] = useState<{ fps: number; drawCalls: number; triangles: number; dpr: number } | null>(
      null
    );
    // "Unit Search" gates GLB unit-box visibility, same as the old
    // MapboxProjectViewer — procedural units are always visible/filterable.
    const showUnitBoxes = panel === "search";
    // X-Ray (PRD §51) is GLB-only — "facade" isn't a meaningful concept for
    // the procedural massing fallback's already-see-through construction
    // shells — and, same "gated by which panel is open" pattern as
    // showUnitBoxes above, is only active while its own panel is open.
    const xrayEnabled = usingGlb && panel === "xray";
    const { t } = useT();
    const priceFmt = usePriceFormat();

    function matchesFilters(u: Unit): boolean {
      if (filter !== "all" && u.status !== filter) return false;
      if (bedroomFilter != null && u.bedrooms < bedroomFilter) return false;
      if (bathroomFilter != null && u.bathrooms < bathroomFilter) return false;
      if (minArea != null && u.area < minArea) return false;
      return true;
    }

    // Status legend (PRD §58) — only statuses actually present among
    // currently-filtered units, in a fixed available/reserved/sold order.
    const presentStatuses = useMemo(() => {
      const set = new Set(project.units.filter(matchesFilters).map((u) => u.status));
      return (["available", "reserved", "sold"] as const).filter((s) => set.has(s));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.units, filter, bedroomFilter, bathroomFilter, minArea]);

    useEffect(() => {
      onBarOpenChange?.(panel !== null && showChrome);
    }, [panel, showChrome, onBarOpenChange]);

    const areaBounds = useMemo(() => {
      const areas = project.units.map((u) => u.area);
      const min = areas.length ? Math.floor(Math.min(...areas) / 5) * 5 : 0;
      const max = areas.length ? Math.ceil(Math.max(...areas) / 5) * 5 : 200;
      return { min, max: max > min ? max : min + 10 };
    }, [project.units]);

    function resetCamera() {
      const controls = controlsRef.current;
      const camera = cameraRef.current;
      const start = defaultCameraRef.current;
      if (!controls || !camera || !start) return;
      // Audit fix: without this, an in-flight camera-preset transition
      // (see jumpToCameraPreset/stepCameraTransition) would overwrite
      // this snap right back toward the preset on the very next
      // animation-loop tick — Home would appear to silently do nothing
      // if clicked while a preset was still easing in.
      cameraTransitionRef.current = null;
      camera.position.copy(start.position);
      controls.target.copy(start.target);
      // A preset can change FOV (stepCameraTransition does); Home should
      // restore the project's real starting FOV too, not just position.
      camera.fov = start.fov;
      camera.updateProjectionMatrix();
      controls.update();
    }

    /** North Sign — rotates the camera to a canonical heading (theta=0)
     * around the current target. For the procedural fallback this scene has
     * no real geographic orientation; for a loaded GLB it's an
     * approximation too (true alignment would need to also account for
     * `config.northRotationDeg` against the *camera*, not just the sun —
     * left as a known simplification for Phase 1, flagged rather than
     * silently assumed correct). */
    function resetToNorth() {
      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!controls || !camera) return;
      // Same "an in-flight preset transition would overwrite this" fix
      // as resetCamera above.
      cameraTransitionRef.current = null;
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta = 0;
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }

    /** Starts a smooth eased transition to a saved camera preset (PRD
     * §22/§24 — "never visibly teleport") rather than snapping. Stepped
     * from the animation loop's stepCameraTransition; cleared early if the
     * user starts dragging OrbitControls mid-flight. */
    function jumpToCameraPreset(preset: CameraPreset) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      cameraTransitionRef.current = {
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

    useImperativeHandle(ref, () => ({
      resetView: resetCamera,
      captureScreenshot: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        // Same "force one fresh render right before reading the buffer" as
        // before. Known Phase-1 gap: WebGPURenderer has no
        // `preserveDrawingBuffer` equivalent, so this can occasionally
        // return a blank frame on the WebGPU backend specifically (browser
        // is free, not guaranteed, to clear right after compositing) —
        // acceptable for now; a real off-screen-render-target capture is
        // the fix, sequenced with the deferred "Ultra Capture" mode (spec
        // §22), not before.
        if (renderPipelineRef.current) renderPipelineRef.current.render();
        else renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      },
      getCameraState: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return null;
        return {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
          fov: camera.fov,
        };
      },
    }));

    function applyUnitAppearance(mesh: THREE.Mesh, box: UnitBox) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const isSelected = box.unit.id === selectedUnitId;
      const isHovered = box.unit.id === hoveredIdRef.current;
      const preset = VIEW_PRESET_MATERIAL[viewPreset];
      const baseColor = preset.color ?? STATUS_COLOR[box.unit.status];
      material.color.setHex(isSelected ? SELECTED_COLOR : baseColor);
      material.emissive.setHex(isSelected ? SELECTED_COLOR : isHovered ? 0x333333 : 0x000000);
      material.emissiveIntensity = isSelected ? 0.35 : isHovered ? 0.5 : 0;
      material.roughness = preset.roughness;
      material.metalness = preset.metalness;

      const progress = constructionProgressPercent ?? project.progressPercent;
      const isBuilt =
        !config.constructionStagesEnabled ||
        project.status !== "under_construction" ||
        box.floorIndex / Math.max(1, box.totalFloorsInBuilding) <= progress / 100;
      const visible = matchesFilters(box.unit) && isBuilt;
      mesh.visible = visible;

      const edges = unitEdgesRef.current.get(box.unit.id);
      if (edges) {
        edges.visible = visible && preset.edges;
        (edges.material as THREE.LineBasicMaterial).opacity = preset.edgeOpacity;
      }
    }

    function refreshGlbUnitBoxAppearance() {
      glbUnitBoxesRef.current.forEach(({ node, unitId }) => {
        const unit = project.units.find((u) => u.id === unitId);
        if (!unit) {
          node.visible = false;
          return;
        }
        const isSelected = unitId === selectedUnitId;
        const isHovered = unitId === hoveredIdRef.current;
        // X-Ray forces boxes visible even with the Unit Search panel
        // closed — fading the facade to see nothing behind it would defeat
        // the point.
        node.visible = (showUnitBoxes || xrayEnabled) && matchesFilters(unit);
        const color = isSelected ? SELECTED_COLOR : UNIT_BOX_COLOR[unit.status];
        const baseOpacity = isSelected || isHovered ? UNIT_BOX_SELECTED_OPACITY : UNIT_BOX_OPACITY;
        const opacity = xrayEnabled ? Math.min(1, baseOpacity + UNIT_BOX_XRAY_OPACITY_BOOST) : baseOpacity;
        applyUnitBoxMaterial(node, color, opacity);
      });
    }

    function refreshAllAppearance() {
      if (usingGlb) {
        refreshGlbUnitBoxAppearance();
      } else {
        unitBoxesRef.current.forEach((box) => {
          const mesh = unitMeshesRef.current.get(box.unit.id);
          if (mesh) applyUnitAppearance(mesh, box);
        });
      }
    }

    /** Applies the shared VIEW_PRESET_MATERIAL treatment to every mesh in a
     * loaded GLB except tagged unit boxes (own status color) and tagged
     * `Glass_*` nodes (own glass-tier physical material, see
     * applyGlassPreset below). */
    function applyGlbMaterialPreset(root: THREE.Object3D) {
      const preset = VIEW_PRESET_MATERIAL[viewPreset];
      const unitBoxNodes = new Set(Array.from(glbUnitBoxesRef.current.values()).map((e) => e.node));
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
          // X-Ray (PRD §51): fades everything that isn't a unit box or
          // glass down to a low, admin/buyer-adjustable opacity so units
          // behind the facade read through it.
          std.transparent = xrayEnabled;
          std.opacity = xrayEnabled ? xrayFacadeOpacity : 1;
          std.depthWrite = !xrayEnabled;
          // Toggling `.transparent` changes the material's blend/compile
          // state — unlike the color/roughness/metalness fields above,
          // this needs an explicit recompile flag or three.js can keep
          // rendering the old (opaque) blend mode.
          std.needsUpdate = true;
        });
      });
    }

    /** Replaces every `Glass_*`-named node's material with a real
     * MeshPhysicalMaterial tuned by the project's `glassPreset` (spec §8) —
     * this is what makes glazing read as transmissive/reflective instead of
     * flat, and is why real environment lighting (see the sky/PMREM setup
     * below) matters: transmission/IOR only look convincing against a real
     * environment map, not a flat background color. */
    function applyGlassPreset(root: THREE.Object3D) {
      const tier = GLASS_TIERS[config.glassPreset];
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
          envMapIntensity: config.environmentIntensity,
        });
      });
    }

    /** Admin's Scene Explorer classification/material overrides (Editor UX
     * & Scene Structure pass) — runs after applyGlbMaterialPreset/
     * applyGlassPreset above so it customizes specific nodes on top of
     * their baseline treatment, not the other way round. Overrides are
     * stored keyed by rzNodeId (a server-computed id the client never
     * recomputes); resolving which live Object3D that refers to is still
     * name-based, via a `name -> override` map built from the fetched
     * sceneManifest — same limitation UnitMeshLink already has, see
     * SceneManifestNode's doc comment in src/lib/types.ts. */
    function applyNodeOverrides(root: THREE.Object3D) {
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
      const unitBoxNodes = new Set(Array.from(glbUnitBoxesRef.current.values()).map((e) => e.node));
      root.traverse((child) => {
        if (unitBoxNodes.has(child)) return;
        if (GLASS_NODE_PATTERN.test(child.name)) return;
        const override = nameToOverride.get(child.name);
        if (!override) return;

        // Helper nodes (guide/reference geometry a 3D artist left in) are
        // hidden by default — the one concrete runtime effect
        // classification gets in this pass; Landscape/Interaction are
        // organizational only for now. An explicit `visible: true`
        // override still wins, so Admin can un-hide one deliberately.
        if (override.classification === "helper" && override.visible !== true) {
          child.visible = false;
        }

        const preset = override.materialPreset ? MATERIAL_PRESETS[override.materialPreset] : null;
        const hasMaterialOverride = !!(preset || override.colorHex || override.roughness != null || override.metalness != null);
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
        });
      });
    }

    // --- Procedural (gradient) sky + real environment/reflection lighting,
    // shared by both content modes. A plain CanvasTexture is
    // backend-agnostic (WebGPU and WebGL2 render it identically, unlike
    // Three.js's shader-based Sky/SkyMesh addons which are each locked to
    // one backend) — see the Phase 1 plan for why this, not full
    // atmospheric scattering, is the Phase 1 scope. ---
    function buildSkyTexture(): THREE.Texture {
      const stops = SKY_GRADIENTS[config.skyPreset];
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

    function rebuildEnvironment() {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const pmrem = pmremRef.current;
      if (!renderer || !scene || !pmrem) return;
      const skyTexture = buildSkyTexture();
      const renderTarget = pmrem.fromEquirectangular(skyTexture);
      skyTexture.dispose();
      envRenderTargetRef.current?.dispose();
      envRenderTargetRef.current = renderTarget;
      // Environment lighting/reflections always come from the sky PMREM,
      // regardless of backgroundPreset — only the visible backdrop
      // (background) changes. Previously these were always forced
      // identical; `backgroundPreset` existed in the schema/config type
      // since "3D Experience Phase 1" but was never actually read here.
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

    /** Builds (or rebuilds) the TSL post-processing pipeline for the given
     * quality tier — Render/visual quality pass. Uses `RenderPipeline`
     * (three.js's current, non-deprecated pipeline/output-node manager;
     * the older `PostProcessing` class is deprecated since r183 and just
     * warns+delegates to this one) over a single MRT-enabled scene pass
     * (color + depth + normal — GTAO/SSR both need the normal buffer, so
     * it's requested unconditionally rather than conditionally per tier).
     * Wrapped in try/catch: none of this can be visually verified in this
     * environment, so a construction failure degrades to "no post-
     * processing" (renderPipelineRef stays null, the render loop below
     * falls back to a plain renderer.render(scene, camera), today's exact
     * behavior) rather than breaking the viewer outright.
     *
     * Disposal note (Publish/runtime hardening pass): `RenderPipeline
     * .dispose()`, called before every rebuild here, only disposes its
     * own internal quad-mesh material — none of GTAONode/SSRNode/
     * BloomNode/SMAANode expose a public `.dispose()` in @types/three, so
     * whether their own internal render targets (blur/denoise buffers
     * etc.) get released on rebuild isn't something this code can
     * directly force, and I can't watch a GPU memory profile in this
     * environment to confirm either way. Bounded in practice: this
     * function only runs once at setup plus up to
     * ADAPTIVE_DOWNGRADE_ORDER.length more times per mounted session (the
     * one-directional adaptive downgrade), never in a loop — a real
     * open question, not a silent one, but not an unbounded leak either. */
    function buildRenderPipeline(tier: QualityTierSettings) {
      renderPipelineRef.current?.dispose();
      renderPipelineRef.current = null;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return;
      try {
        const scenePass = pass(scene, camera);
        scenePass.setMRT(mrt({ output, normal: normalView }));
        const color = scenePass.getTextureNode("output");
        const depth = scenePass.getTextureNode("depth");
        const normal = scenePass.getTextureNode("normal");

        // AO darkens ambient-occluded areas of the base color first, SSR
        // then blends screen-space reflections into that (so a
        // reflection's own content isn't additionally darkened by the
        // *reflecting* surface's local AO), Bloom adds a glow from bright
        // regions on top of the combined result, SMAA anti-aliases last —
        // applied separately below (not folded into this chain) since
        // @types/three's SMAANode extends the untyped base TempNode, not
        // TempNode<"vec4"> like BloomNode/SSRNode do, so it doesn't unify
        // with this chain's Node<"vec4"> typing.
        let chain: THREE.Node<"vec4"> = color;
        // normal is a general vec4 TextureNode (RGBA-backed); ao()/ssr()
        // want the vec3 normal specifically.
        const normal3 = normal.xyz;
        if (tier.gtao) chain = chain.mul(ao(depth, normal3, camera));
        if (tier.ssr) chain = ssr(chain, depth, normal3, { camera });
        if (tier.bloom) chain = chain.add(bloom(chain, 0.6, 0.4, 0.85));

        const pipeline = new THREE.RenderPipeline(renderer);
        // outputNode is a bare, untyped `Node` slot — assigning either the
        // vec4 chain directly or SMAA's wrapped result both upcast to it
        // fine, so no cast/type gymnastics needed here despite the
        // asymmetry above.
        pipeline.outputNode = tier.antialias ? smaa(chain) : chain;
        renderPipelineRef.current = pipeline;
      } catch (err) {
        console.error("3D Experience: post-processing pipeline failed, falling back to direct render", err);
        renderPipelineRef.current = null;
      }
    }

    // --- One-time scene setup per project/content-mode/rendering-mode ---
    useEffect(() => {
      const containerEl = containerRef.current;
      if (!containerEl) return;
      // Narrowed to a non-null local — TS's control-flow narrowing above
      // doesn't carry into the nested `async function setup()` below.
      const container: HTMLDivElement = containerEl;
      let cancelled = false;
      let resizeObserver: ResizeObserver | null = null;
      let handleMove: ((e: PointerEvent) => void) | null = null;
      let handleClick: ((e: PointerEvent) => void) | null = null;
      let handleLeave: (() => void) | null = null;
      let dracoLoader: DRACOLoader | null = null;
      let disposeGeometry: (() => void) | null = null;

      async function setup() {
        const renderer = new THREE.WebGPURenderer({
          antialias: true,
          // "auto"/"webgpu" both let Three.js probe for WebGPU and fall
          // back to WebGL2 automatically (WebGPURenderer's own built-in
          // `getFallback`); only "webgl2" forces the WebGL2 backend
          // outright. There's no public API to *forbid* the automatic
          // fallback, so "webgpu" behaves like "auto" today — documented,
          // not a bug.
          forceWebGL: config.renderingMode === "webgl2",
        });
        try {
          await renderer.init();
        } catch {
          if (!cancelled) setWebglFailReason(t("map.noWebglShort"));
          return;
        }
        if (cancelled) {
          renderer.dispose();
          return;
        }

        const tier = QUALITY_TIERS[config.qualityPreset];
        // Fresh setup (new project/GLB/rendering-mode) resets any runtime
        // adaptive downgrade from a prior mount back to Admin's real tier.
        effectiveTierRef.current = tier;
        frameTimesRef.current = [];
        downgradeStepRef.current = 0;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.dprCap));
        renderer.setSize(
          container.clientWidth * tier.renderScale,
          container.clientHeight * tier.renderScale,
          false
        );
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Applies to both the post-processing pipeline (RenderPipeline
        // reads the renderer's own toneMapping to build its auto output-
        // transform node) and the plain renderer.render() fallback path
        // below, which honors these renderer properties on its own.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = config.exposure;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        const envScene = new THREE.Scene();
        envSceneRef.current = envScene;
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmremRef.current = pmrem;

        const isMobileViewport = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
        const fov = isMobileViewport ? config.cameraFovMobile : config.cameraFovDesktop;
        const camera = new THREE.PerspectiveCamera(
          fov,
          container.clientWidth / Math.max(1, container.clientHeight),
          0.1,
          2000
        );
        cameraRef.current = camera;

        // Real sun — see src/lib/sunPosition.ts. Direction only; distance
        // is arbitrary for a DirectionalLight, scaled by boundingRadius
        // once that's known below. Shadow bias/normalBias are scaled to
        // boundingRadius too, not left as fixed absolute values — a fixed
        // ~0.02-unit bias is negligible (and produces shadow-acne flicker,
        // "faces hiding and reappearing") against a real building GLB tens
        // or hundreds of meters across, even though it worked fine for the
        // procedural fallback's small, roughly-uniform unit boxes.
        const sun = new THREE.DirectionalLight(0xffffff, 2);
        sun.castShadow = true;
        sun.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
        const ambient = new THREE.AmbientLight(0xffffff, 0.15);
        scene.add(sun, sun.target, ambient);
        sunRef.current = sun;
        ambientRef.current = ambient;

        pickableRef.current = new Map();
        unitMeshesRef.current = new Map();
        unitEdgesRef.current = new Map();
        shellsRef.current = [];
        glbUnitBoxesRef.current = new Map();

        let boundingRadius = 20;
        let centerX = 0;
        let centerY = 1;
        let centerZ = 0;

        if (usingGlb && detailModel) {
          // --- GLB content ---
          dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
          const loader = new GLTFLoader();
          loader.setDRACOLoader(dracoLoader);

          let gltf;
          try {
            gltf = await loader.loadAsync(detailModel.glbUrl);
          } catch (err) {
            // Failure recovery (Publish/runtime hardening pass): a bad
            // URL/network error/corrupt file used to dead-end here in the
            // same "no WebGL" error screen a genuine renderer failure
            // shows — misleading (this isn't a WebGL problem), and worse
            // than necessary, since the procedural-massing fallback this
            // component already has for "no detail model enabled" is one
            // `if/else` branch away. Flipping `glbLoadFailed` changes
            // `usingGlb` (already in this effect's dependency array),
            // which makes React clean up this half-built attempt and
            // re-run setup() — naturally taking the `else` branch below
            // this time, no manual duplication of its logic needed.
            console.warn(
              "3D Experience: detail GLB failed to load, falling back to procedural massing",
              err
            );
            if (!cancelled) setGlbLoadFailed(true);
            return;
          }
          if (cancelled) return;

          const root = gltf.scene;
          root.scale.setScalar(detailModel.scale);
          root.rotation.y = THREE.MathUtils.degToRad(detailModel.rotationDeg);
          root.position.y = detailModel.altitudeOffset;
          root.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          scene.add(root);
          glbRootRef.current = root;

          const linkByName = new Map(
            (detailModel.unitLinks as UnitMeshLink[]).map((l) => [l.meshName, l.unitId])
          );
          root.traverse((child) => {
            const unitId = linkByName.get(child.name);
            if (!unitId) {
              if (UNIT_NODE_PATTERN.test(child.name)) child.visible = false;
              return;
            }
            child.visible = false;
            child.userData.unitId = unitId;
            glbUnitBoxesRef.current.set(child.name, { node: child, unitId });
            pickableRef.current.set(unitId, child);
          });

          applyGlbMaterialPreset(root);
          applyGlassPreset(root);
          applyNodeOverrides(root);

          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          boundingRadius = Math.max(size.x, size.y, size.z) * 0.65 || 20;
          // Unlike the procedural fallback (always laid out centered at
          // X=0/Z=0 by computeProjectLayout), a real uploaded GLB is very
          // often authored off-origin (real-world survey coordinates,
          // arbitrary export origin, etc.) — using the bounding box's real
          // center here, not a hardcoded (0, y, 0), is what was missing
          // before. Locking the orbit pivot/shadow target to the wrong
          // X/Z point meant the camera orbited around empty space instead
          // of the building: it could swing through/inside the model at
          // the fixed startDistance, producing exactly "faces hide and
          // reappear" (near-plane clipping through walls) and "doesn't
          // snap correctly when rotating" (the model swings instead of
          // spinning in place).
          centerX = center.x;
          centerY = center.y;
          centerZ = center.z;

          disposeGeometry = () => {
            scene.remove(root);
            disposeGlbObject3D(root);
          };
        } else {
          // --- Procedural massing fallback ---
          const layout = computeProjectLayout(project);
          unitBoxesRef.current = layout.units;
          boundingRadius = layout.boundingRadius;
          centerY = layout.centerY;

          const ground = new THREE.Mesh(
            new THREE.CircleGeometry(layout.boundingRadius * 1.6, 48),
            new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 1 })
          );
          ground.rotation.x = -Math.PI / 2;
          ground.receiveShadow = true;
          scene.add(ground);
          groundRef.current = ground;

          for (const b of layout.buildings) {
            const shell = new THREE.Mesh(
              new THREE.BoxGeometry(b.width + 0.4, b.height + 0.4, b.depth + 0.4),
              new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.08,
                depthWrite: false,
              })
            );
            shell.position.set(b.centerX, b.height / 2, b.z);
            shell.userData.isShell = true;
            scene.add(shell);
            shellsRef.current.push(shell);
          }

          const geometry = new THREE.BoxGeometry(1, 1, 1);
          const edgeGeometry = new THREE.EdgesGeometry(geometry);
          for (const unitBox of layout.units) {
            const material = new THREE.MeshStandardMaterial({
              color: STATUS_COLOR[unitBox.unit.status],
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
            unitMeshesRef.current.set(unitBox.unit.id, mesh);
            pickableRef.current.set(unitBox.unit.id, mesh);

            const edges = new THREE.LineSegments(
              edgeGeometry,
              new THREE.LineBasicMaterial({ color: 0x2a2a33, transparent: true, opacity: 0 })
            );
            edges.visible = false;
            mesh.add(edges);
            unitEdgesRef.current.set(unitBox.unit.id, edges);
          }

          disposeGeometry = () => {
            geometry.dispose();
            edgeGeometry.dispose();
            unitMeshesRef.current.forEach((mesh) => (mesh.material as THREE.Material).dispose());
            unitEdgesRef.current.forEach((edges) => (edges.material as THREE.Material).dispose());
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
        if (cancelled) return;

        const target = new THREE.Vector3(centerX, centerY, centerZ);
        const startDistance = boundingRadius * config.cameraStartDistanceMultiplier;
        camera.position.set(
          centerX + startDistance * 0.6,
          centerY + startDistance * 0.55,
          centerZ + startDistance * 0.9
        );
        camera.lookAt(target);
        defaultCameraRef.current = { position: camera.position.clone(), target: target.clone(), fov: camera.fov };

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(target);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = boundingRadius * config.cameraMinDistanceMultiplier;
        controls.maxDistance = boundingRadius * config.cameraMaxDistanceMultiplier;
        controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
        controls.autoRotate = config.autoRotate;
        controls.autoRotateSpeed = 0.6;
        controls.update();
        controlsRef.current = controls;

        // Bias scaled to boundingRadius, not a fixed absolute value — a
        // fixed ~0.0005/0.02 bias is negligible against a real building
        // tens/hundreds of meters across (shadow acne — the flicker
        // reported as "faces hiding and reappearing"), even though it was
        // fine for the procedural fallback's small, roughly-uniform units.
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

        if (groundRef.current) groundRef.current.visible = config.groundEnabled;
        const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
        shellsRef.current.forEach((shell) => (shell.visible = showShells));

        rebuildEnvironment();
        buildRenderPipeline(effectiveTierRef.current);

        setReady(true);
        setWebglFailReason(null);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        // Three.js's Raycaster doesn't skip invisible objects on its own
        // (Mesh.raycast never checks `.visible`) — the same reason the old
        // DetailModelLayer.ts had to pre-filter its own node list before
        // raycasting. Filtering the *input* list (rather than the hits) is
        // what actually keeps a filtered-out/unlinked unit from being
        // clickable.
        const pickableList = () => Array.from(pickableRef.current.values()).filter((obj) => obj.visible);

        function pointerFromEvent(e: PointerEvent) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        }
        function pickUnitId(e: PointerEvent): string | null {
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
        }

        handleMove = (e: PointerEvent) => {
          const nextHoverId = pickUnitId(e);
          if (nextHoverId !== hoveredIdRef.current) {
            hoveredIdRef.current = nextHoverId;
            refreshAllAppearance();
            renderer.domElement.style.cursor = nextHoverId ? "pointer" : "grab";
            setHoveredUnit(nextHoverId ? project.units.find((u) => u.id === nextHoverId) ?? null : null);
          }
          // Tracked on every move, not just id changes, and applied
          // imperatively (matching this function's existing direct
          // `.style.cursor` mutation above) rather than through React state
          // — going through setState per pixel of mouse movement would mean
          // a full re-render per pixel.
          if (tooltipElRef.current && nextHoverId) {
            tooltipElRef.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 16}px)`;
          }
        };
        handleClick = (e: PointerEvent) => {
          const unitId = pickUnitId(e);
          if (!unitId) return;
          const unit = project.units.find((u) => u.id === unitId);
          if (unit && onSelectUnit) onSelectUnit(unit);
        };
        handleLeave = () => {
          // Without this, moving the mouse off the canvas edge mid-hover
          // leaves the cursor/tooltip/highlight stuck on whatever unit was
          // last under the pointer — pointermove simply stops firing once
          // the pointer leaves this element, it doesn't emit one final
          // "nothing hovered" event on its own.
          if (hoveredIdRef.current !== null) {
            hoveredIdRef.current = null;
            refreshAllAppearance();
          }
          renderer.domElement.style.cursor = "grab";
          setHoveredUnit(null);
        };

        renderer.domElement.style.cursor = "grab";
        renderer.domElement.addEventListener("pointermove", handleMove);
        renderer.domElement.addEventListener("click", handleClick);
        renderer.domElement.addEventListener("pointerleave", handleLeave);

        resizeObserver = new ResizeObserver(() => {
          if (!container.clientWidth || !container.clientHeight) return;
          const nextIsMobile = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
          camera.fov = nextIsMobile ? config.cameraFovMobile : config.cameraFovDesktop;
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          const t = QUALITY_TIERS[config.qualityPreset];
          renderer.setSize(container.clientWidth * t.renderScale, container.clientHeight * t.renderScale, false);
        });
        resizeObserver.observe(container);

        function sampleAdaptiveQuality(now: number) {
          const last = lastFrameAtRef.current;
          lastFrameAtRef.current = now;
          if (last == null) return;
          const frames = frameTimesRef.current;
          frames.push(now - last);
          if (frames.length > 90) frames.shift();
          // Wait for a full window before judging, and stop once every
          // downgrade step has already been used — nothing left to try.
          if (frames.length < 60 || downgradeStepRef.current >= ADAPTIVE_DOWNGRADE_ORDER.length) return;
          const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
          if (avg <= 33) return; // healthy (roughly >=30fps sustained)
          const flag = ADAPTIVE_DOWNGRADE_ORDER[downgradeStepRef.current];
          effectiveTierRef.current = { ...effectiveTierRef.current, [flag]: false };
          downgradeStepRef.current += 1;
          frameTimesRef.current = []; // fresh window before judging the next step
          console.info(
            `3D Experience: sustained low frame rate (~${avg.toFixed(0)}ms/frame) — disabling "${flag}" to recover`
          );
          buildRenderPipeline(effectiveTierRef.current);
        }

        function stepCameraTransition(now: number) {
          const t = cameraTransitionRef.current;
          if (!t) return;
          const elapsed = now - t.startTime;
          const p = Math.min(1, elapsed / t.durationMs);
          const eased = p * p * (3 - 2 * p); // smoothstep — no visible "teleport"
          camera.position.lerpVectors(t.startPos, t.endPos, eased);
          controls.target.lerpVectors(t.startTarget, t.endTarget, eased);
          camera.fov = t.startFov + (t.endFov - t.startFov) * eased;
          camera.updateProjectionMatrix();
          if (p >= 1) cameraTransitionRef.current = null;
        }

        // A user grabbing the view mid-transition should win immediately,
        // not fight the animation for the remaining duration.
        controls.addEventListener("start", () => {
          cameraTransitionRef.current = null;
        });

        function samplePerfStats() {
          if (!showPerfStatsRef.current) return;
          // Every ~30 frames (roughly twice a second at 60fps, slower on
          // a struggling device — still throttled relative to whatever
          // the real frame rate is) rather than a fixed setTimeout, so
          // this never fights the adaptive-quality sampler's own timing.
          perfSampleCounterRef.current += 1;
          if (perfSampleCounterRef.current % 30 !== 0) return;
          const frames = frameTimesRef.current;
          const avgFrameMs = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0;
          setPerfStats({
            fps: avgFrameMs > 0 ? Math.round(1000 / avgFrameMs) : 0,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            dpr: renderer.getPixelRatio(),
          });
        }

        refreshAllAppearance();
        await renderer.setAnimationLoop(() => {
          const now = performance.now();
          sampleAdaptiveQuality(now);
          // Audit fix: controls.update() must run BEFORE
          // stepCameraTransition, not after. OrbitControls.update() reads
          // camera.position/controls.target fresh each call and, when
          // autoRotate is on, unconditionally nudges them further
          // (state === NONE the whole time a preset transition runs,
          // since the user isn't dragging) — running it after the
          // transition's explicit lerp meant that nudge silently
          // overwrote the transition's intended position every frame,
          // fighting the "never visibly teleport" smoothstep with a
          // slow drift for the whole transition. stepCameraTransition's
          // lerp is computed from fixed start/end snapshots (not from
          // whatever controls.update() just did), so putting it last
          // makes it the authoritative final write for the frame.
          controls.update();
          stepCameraTransition(now);
          if (renderPipelineRef.current) renderPipelineRef.current.render();
          else renderer.render(scene, camera);
          samplePerfStats();
        });
      }

      setup();

      return () => {
        cancelled = true;
        const renderer = rendererRef.current;
        if (renderer) {
          renderer.setAnimationLoop(null);
          if (handleMove) renderer.domElement.removeEventListener("pointermove", handleMove);
          if (handleClick) renderer.domElement.removeEventListener("click", handleClick);
          if (handleLeave) renderer.domElement.removeEventListener("pointerleave", handleLeave);
        }
        resizeObserver?.disconnect();
        controlsRef.current?.dispose();
        disposeGeometry?.();
        dracoLoader?.dispose();
        envRenderTargetRef.current?.dispose();
        pmremRef.current?.dispose();
        renderPipelineRef.current?.dispose();
        renderPipelineRef.current = null;
        cameraTransitionRef.current = null;
        // Memory/disposal symmetry (Publish/runtime hardening pass) — a
        // project switch tears down and re-runs this whole effect
        // (project.id is in its dependency array); without resetting
        // these too, the next project's fresh session would inherit a
        // stale adaptive-downgrade step and frame-time window from
        // whatever the previous project's runtime conditions happened to
        // leave behind.
        frameTimesRef.current = [];
        lastFrameAtRef.current = null;
        downgradeStepRef.current = 0;
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement.parentElement === container) {
            container.removeChild(renderer.domElement);
          }
        }
        rendererRef.current = null;
        sceneRef.current = null;
        envSceneRef.current = null;
        pmremRef.current = null;
        envRenderTargetRef.current = null;
        controlsRef.current = null;
        glbRootRef.current = null;
        unitMeshesRef.current.clear();
        unitEdgesRef.current.clear();
        glbUnitBoxesRef.current.clear();
        pickableRef.current.clear();
        setReady(false);
      };
      // Geometry/renderer only depend on which content is loaded — config
      // tweaks that don't require a full rebuild are applied in-place by
      // the effects below instead.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, usingGlb, detailModel?.glbUrl, config.renderingMode, config.qualityPreset]);

    // --- Apply lower-cost config changes without a full rebuild: ground/
    // shell visibility, camera limits, glass tier, view preset. ---
    useEffect(() => {
      if (!ready) return;
      const controls = controlsRef.current;
      if (groundRef.current) groundRef.current.visible = config.groundEnabled;
      const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
      shellsRef.current.forEach((shell) => (shell.visible = showShells));
      if (controls) {
        const layout = usingGlb ? null : computeProjectLayout(project);
        const boundingRadius = layout?.boundingRadius ?? controls.getDistance();
        controls.minDistance = boundingRadius * config.cameraMinDistanceMultiplier;
        controls.maxDistance = boundingRadius * config.cameraMaxDistanceMultiplier;
        controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
        controls.autoRotate = config.autoRotate;
      }
      // Audit fix: previously only read once at initial camera creation
      // and inside the resize observer's own stale closure — the admin
      // editor's live FOV sliders (draft.cameraFovDesktop/Mobile feeding
      // straight into this preview's config prop) had no visible effect
      // until some unrelated dep also happened to change.
      if (cameraRef.current) {
        const nextIsMobile = window.innerWidth < MOBILE_VIEWPORT_BREAKPOINT;
        cameraRef.current.fov = nextIsMobile ? config.cameraFovMobile : config.cameraFovDesktop;
        cameraRef.current.updateProjectionMatrix();
      }
      if (glbRootRef.current) {
        applyGlassPreset(glbRootRef.current);
        applyGlbMaterialPreset(glbRootRef.current);
        applyNodeOverrides(glbRootRef.current);
      }
      if (rendererRef.current) rendererRef.current.toneMappingExposure = config.exposure;
      refreshAllAppearance();
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
      viewPreset,
      xrayEnabled,
      xrayFacadeOpacity,
      detailModel?.nodeOverrides,
      detailModel?.sceneManifest,
    ]);

    // --- Real geographic sun + sky/environment (spec §4/§15) — recomputed
    // whenever the effective time-of-day, sky preset, environment
    // intensity or north rotation change. Runs for both the public viewer
    // (live `timeOfDay` state, seeded from config.defaultTimeOfDay) and the
    // Admin preview (showChrome=false locks it to config.defaultTimeOfDay
    // since there's no bottom-bar slider to move it there). ---
    const effectiveTimeOfDay = showChrome ? timeOfDay : config.defaultTimeOfDay;
    useEffect(() => {
      if (!ready) return;
      const sun = sunRef.current;
      const ambient = ambientRef.current;
      const scene = sceneRef.current;
      if (!sun || !ambient || !scene) return;

      const sunPos = calcSunPosition({
        lat: project.coords.lat,
        lng: project.coords.lng,
        date: new Date(),
        timeOfDay: effectiveTimeOfDay,
        northRotationDeg: config.northRotationDeg,
      });
      const dir = sunDirectionVector(sunPos);
      const distance = 200;
      sun.position.set(dir.x * distance, Math.max(dir.y, 0.05) * distance, dir.z * distance);
      sun.color.setHex(sunColorForElevation(sunPos.elevationDeg));
      sun.intensity = sunPos.isNight ? 0.1 : 1.2 + Math.max(0, sunPos.elevationDeg / 90) * 1.8;
      ambient.intensity = sunPos.isNight ? 0.08 : 0.15;

      rebuildEnvironment();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      ready,
      effectiveTimeOfDay,
      config.skyPreset,
      config.backgroundPreset,
      config.environmentIntensity,
      config.northRotationDeg,
      project.coords.lat,
      project.coords.lng,
    ]);

    // --- Re-evaluate per-unit appearance whenever selection, filters,
    // construction progress or the Unit-Search panel toggle change ---
    useEffect(() => {
      refreshAllAppearance();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      selectedUnitId,
      filter,
      bedroomFilter,
      bathroomFilter,
      minArea,
      viewPreset,
      constructionProgressPercent,
      config.constructionStagesEnabled,
      showUnitBoxes,
      xrayEnabled,
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
                {config.viewerUI.viewPreset && (
                  <MenuIconButton
                    icon={Palette}
                    label={t("project.viewPreset")}
                    onClick={() => setPanel("viewPreset")}
                  />
                )}
                {usingGlb && (
                  <MenuIconButton icon={Layers} label={t("project.xray")} onClick={() => setPanel("xray")} />
                )}
                {config.cameraPresets.length > 0 && (
                  <MenuIconButton
                    icon={Camera}
                    label={t("project.cameraPresets")}
                    onClick={() => setPanel("cameraPresets")}
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
                  dotColor={filter !== "all" ? STATUS_COLOR[filter] : undefined}
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

            {panel === "viewPreset" && (
              <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-2 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
                {VIEW_PRESETS.map(([id, labelKey]) => (
                  <button
                    key={id}
                    onClick={() => setViewPreset(id)}
                    aria-pressed={viewPreset === id}
                    className={cn(
                      "rounded-control px-4 py-2.5 text-sm font-semibold transition-colors",
                      viewPreset === id ? "bg-brand-500 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {t(labelKey)}
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

            {panel === "xray" && (
              <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-4 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
                <div className="min-w-[10rem] flex-1">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    <span>{t("project.xrayFacadeOpacity")}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={xrayFacadeOpacity}
                    onChange={(e) => setXrayFacadeOpacity(Number(e.target.value))}
                    className="h-6 w-full accent-white"
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

            {panel === "cameraPresets" && (
              <div className="glass-panel-dark relative flex w-full flex-wrap items-center gap-2 rounded-panel px-4 py-3.5 pr-11 sm:w-auto sm:flex-nowrap">
                {config.cameraPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      jumpToCameraPreset(preset);
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

        {showChrome && ready && (!usingGlb || showUnitBoxes || xrayEnabled) && presentStatuses.length > 0 && (
          <StatusLegend
            className="absolute bottom-4 left-4 z-10"
            statuses={presentStatuses}
            colors={usingGlb ? UNIT_BOX_COLOR : STATUS_COLOR}
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

        {showPerfStats && perfStats && (
          <div className="glass-panel-dark pointer-events-none absolute left-3 top-3 z-20 space-y-0.5 rounded-control px-3 py-2 font-mono text-[10px] leading-relaxed text-white/80">
            <p>FPS {perfStats.fps}</p>
            <p>
              {t("admin.perfDrawCalls")} {perfStats.drawCalls} · {t("admin.perfTriangles")}{" "}
              {perfStats.triangles.toLocaleString()}
            </p>
            <p>DPR {perfStats.dpr.toFixed(2)}×</p>
            {detailModel && (
              <p className="text-white/50">
                {t("admin.perfPublished")} {detailModel.meshCount ?? "—"}m / {detailModel.materialCount ?? "—"}mat /{" "}
                {detailModel.textureCount ?? "—"}tex / {(detailModel.triangleCount ?? 0).toLocaleString()}tri
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);
