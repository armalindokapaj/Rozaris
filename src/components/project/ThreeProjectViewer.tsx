"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Box,
  ChevronUp,
  Expand,
  Minimize,
  Moon,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
  X,
} from "lucide-react";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Project, Project3DConfig, Unit } from "@/lib/types";

export interface ThreeProjectViewerHandle {
  /** PRD §7.1/§16 — "Reset returns to Admin-saved starting camera." */
  resetView: () => void;
  /** Captures the current WebGL frame as a PNG data URL — null if the
   * renderer isn't ready (e.g. WebGL failed to init). */
  captureScreenshot: () => string | null;
}

type Season = "spring" | "summer" | "autumn" | "winter";

const SEASON_GROUND: Record<Season, number> = {
  spring: 0xd7e6d0,
  summer: 0xd8d6e6,
  autumn: 0xe0c9a0,
  winter: 0xeceef2,
};

// 8-way orbit around the target, evenly spaced — labeled like a compass for
// a familiar affordance, but this scene has no real geographic orientation
// (it's a procedural, non-georeferenced building), so "N" is just theta=90°,
// not true north.
const COMPASS_POINTS: { label: string; theta: number }[] = [
  { label: "N", theta: 90 },
  { label: "NE", theta: 45 },
  { label: "E", theta: 0 },
  { label: "SE", theta: -45 },
  { label: "S", theta: -90 },
  { label: "SW", theta: -135 },
  { label: "W", theta: 180 },
  { label: "NW", theta: 135 },
];

function defaultHourForPreset(preset: Project3DConfig["lightingPreset"]): number {
  if (preset === "daylight") return 13;
  if (preset === "overcast") return 11;
  return 18.5; // sunset
}

type AvailabilityFilter = "all" | Unit["status"];

const STATUS_COLOR: Record<Unit["status"], number> = {
  available: 0x23845e, // --color-success
  reserved: 0xa66a12, // --color-warning
  sold: 0x9a9aa3, // --color-sold
};
const SELECTED_COLOR = 0x6b55f5; // --color-brand-500
const GROUND_COLOR = 0xd8d6e6;

const BACKGROUND_COLOR: Record<Project3DConfig["backgroundPreset"], number> = {
  sky: 0xbfe0ff,
  studio_light: 0xf2f0ff,
  studio_dark: 0x1b1a24,
};

/**
 * Pure Three.js project viewer (PRD_3D_Project_Viewer). Renders only the
 * selected project's building(s) on a minimal platform — no surrounding
 * city — using OrbitControls for navigation and a Raycaster for unit
 * picking, per the PRD's Three.js technology baseline (§3). Building
 * geometry is procedural (lib/threeBuilding.ts) rather than a loaded
 * GLB/glTF, since no developer 3D-asset upload pipeline exists yet in this
 * frontend-only prototype — everything else (unit status colors, camera
 * limits, lighting, construction reveal) is driven by real project/config
 * data exactly as the PRD specifies, so swapping in real GLTFLoader-loaded
 * models later only touches the geometry-building step below.
 */
export const ThreeProjectViewer = forwardRef<
  ThreeProjectViewerHandle,
  {
    project: Project;
    config: Project3DConfig;
    className?: string;
    selectedUnitId?: string | null;
    onSelectUnit?: (unit: Unit) => void;
    /** Live construction completion (0-100) — defaults to the project's own
     * seeded value; the Admin preview can override it while scrubbing. */
    constructionProgressPercent?: number;
    /** Public viewer chrome (legend/building selector/fullscreen) is on by
     * default; the Admin live-preview embed turns it off to keep the form
     * the only UI. */
    showChrome?: boolean;
    /** Fires whenever the built-in filter bar (open by default) is
     * opened/closed, so a parent floating its own bottom-anchored UI (e.g.
     * ArchVizClient's "explore units" CTA) can avoid overlapping it instead
     * of guessing a pixel offset — the bar's real height varies a lot by
     * breakpoint (it wraps to multiple rows on narrow screens). */
    onBarOpenChange?: (open: boolean) => void;
  }
>(function ThreeProjectViewer(
  {
    project,
    config,
    className,
    selectedUnitId = null,
    onSelectUnit,
    constructionProgressPercent,
    showChrome = true,
    onBarOpenChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const lightsRef = useRef<{
    hemi: THREE.HemisphereLight;
    sun: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
  } | null>(null);
  const unitMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const shellsRef = useRef<THREE.Mesh[]>([]);
  const unitBoxesRef = useRef<UnitBox[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const defaultCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(
    null
  );

  const [ready, setReady] = useState(false);
  const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
  const [filter, setFilter] = useState<AvailabilityFilter>("all");
  const [activeBuilding, setActiveBuilding] = useState<string | "all">("all");
  const [typeFilter, setTypeFilter] = useState<Unit["type"] | "all">("all");
  const [floorFilter, setFloorFilter] = useState<number | null>(null);
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
  const [minArea, setMinArea] = useState<number | null>(null);
  const [maxArea, setMaxArea] = useState<number | null>(null);
  const [barOpen, setBarOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // Live scene controls — user-side, layered on top of the Admin config's
  // defaults rather than replacing them (see the dedicated effects below).
  const [timeOfDay, setTimeOfDay] = useState(() => defaultHourForPreset(config.lightingPreset));
  const [season, setSeason] = useState<Season>("summer");
  const [landscapeVisible, setLandscapeVisible] = useState(() => config.groundEnabled);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [compassTheta, setCompassTheta] = useState(90);
  const { t } = useT();

  const floorOptions = useMemo(
    () => Array.from(new Set(project.units.map((u) => u.floor))).sort((a, b) => a - b),
    [project.units]
  );

  function matchesFilters(u: Unit): boolean {
    if (filter !== "all" && u.status !== filter) return false;
    if (activeBuilding !== "all" && u.buildingName !== activeBuilding) return false;
    if (typeFilter !== "all" && u.type !== typeFilter) return false;
    if (floorFilter != null && u.floor !== floorFilter) return false;
    if (bedroomFilter != null && u.bedrooms < bedroomFilter) return false;
    if (bathroomFilter != null && u.bathrooms < bathroomFilter) return false;
    if (minArea != null && u.area < minArea) return false;
    if (maxArea != null && u.area > maxArea) return false;
    return true;
  }

  const visibleCount = useMemo(
    () => project.units.filter(matchesFilters).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.units, filter, activeBuilding, typeFilter, floorFilter, bedroomFilter, bathroomFilter, minArea, maxArea]
  );

  function resetFilters() {
    setFilter("all");
    setTypeFilter("all");
    setFloorFilter(null);
    setBedroomFilter(null);
    setBathroomFilter(null);
    setMinArea(null);
    setMaxArea(null);
  }

  // showChrome=false (Admin's live-preview embed) never renders the bar
  // regardless of barOpen's internal value, so report it as closed there.
  useEffect(() => {
    onBarOpenChange?.(barOpen && showChrome);
  }, [barOpen, showChrome, onBarOpenChange]);

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
    camera.position.copy(start.position);
    controls.target.copy(start.target);
    controls.update();
    setActiveBuilding("all");
  }

  useImperativeHandle(ref, () => ({
    resetView: resetCamera,
    captureScreenshot: () => rendererRef.current?.domElement.toDataURL("image/png") ?? null,
  }));

  function applyUnitAppearance(mesh: THREE.Mesh, box: UnitBox) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const isSelected = box.unit.id === selectedUnitId;
    const isHovered = box.unit.id === hoveredIdRef.current;
    material.color.setHex(isSelected ? SELECTED_COLOR : STATUS_COLOR[box.unit.status]);
    material.emissive.setHex(isSelected ? SELECTED_COLOR : isHovered ? 0x333333 : 0x000000);
    material.emissiveIntensity = isSelected ? 0.35 : isHovered ? 0.5 : 0;

    const progress = constructionProgressPercent ?? project.progressPercent;
    const isBuilt =
      !config.constructionStagesEnabled ||
      project.status !== "under_construction" ||
      box.floorIndex / Math.max(1, box.totalFloorsInBuilding) <= progress / 100;
    mesh.visible = matchesFilters(box.unit) && isBuilt;
  }

  function refreshAllAppearance() {
    unitBoxesRef.current.forEach((box) => {
      const mesh = unitMeshesRef.current.get(box.unit.id);
      if (mesh) applyUnitAppearance(mesh, box);
    });
  }

  // --- One-time scene setup per project (geometry is fully rebuilt if the
  // project itself changes, same as MapView re-inits when its token does) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      const probe = document.createElement("canvas");
      gl = (probe.getContext("webgl2") ?? probe.getContext("webgl")) as
        | WebGLRenderingContext
        | WebGL2RenderingContext
        | null;
    } catch {
      gl = null;
    }
    if (!gl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability only known client-side
      setWebglFailReason(t("map.noWebglShort"));
      return;
    }

    const layout = computeProjectLayout(project);
    unitBoxesRef.current = layout.units;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      2000
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // §25 bounded DPR
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const target = new THREE.Vector3(0, layout.centerY, 0);
    const startDistance = layout.boundingRadius * config.cameraStartDistanceMultiplier;
    camera.position.set(startDistance * 0.6, startDistance * 0.55, startDistance * 0.9);
    camera.lookAt(target);
    defaultCameraRef.current = { position: camera.position.clone(), target: target.clone() };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = layout.boundingRadius * config.cameraMinDistanceMultiplier;
    controls.maxDistance = layout.boundingRadius * config.cameraMaxDistanceMultiplier;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
    controls.autoRotate = config.autoRotate;
    controls.autoRotateSpeed = 0.6;
    controls.update();
    controlsRef.current = controls;

    // Lights — presets applied by the config effect below.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a9a, 1);
    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = layout.boundingRadius * 6;
    const shadowSpan = layout.boundingRadius * 1.5;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    scene.add(hemi, ambient, sun, sun.target);
    lightsRef.current = { hemi, sun, ambient };

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(layout.boundingRadius * 1.6, 48),
      new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    // Building envelope shells — a soft outline of the *planned* full
    // height, visible once construction hides not-yet-built floors, so an
    // in-progress building still reads as "under construction" rather than
    // "shorter than it should be" (PRD §10). Visibility toggled by the
    // config effect below, not baked in here.
    shellsRef.current = [];
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
    unitMeshesRef.current = new Map();
    for (const box of layout.units) {
      const material = new THREE.MeshStandardMaterial({
        color: STATUS_COLOR[box.unit.status],
        roughness: 0.6,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(box.width, box.height, box.depth);
      mesh.position.set(box.x, box.y, box.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.unitId = box.unit.id;
      scene.add(mesh);
      unitMeshesRef.current.set(box.unit.id, mesh);
    }

    setReady(true);
    setWebglFailReason(null);

    // --- Interaction: raycaster hover + click ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const meshList = () => Array.from(unitMeshesRef.current.values());

    function pointerFromEvent(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function handleMove(e: PointerEvent) {
      pointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(meshList(), false);
      const hit = hits.find((h) => h.object.visible)?.object as THREE.Mesh | undefined;
      const nextHoverId = (hit?.userData.unitId as string | undefined) ?? null;
      if (nextHoverId !== hoveredIdRef.current) {
        hoveredIdRef.current = nextHoverId;
        refreshAllAppearance();
        renderer.domElement.style.cursor = nextHoverId ? "pointer" : "grab";
      }
    }

    function handleClick(e: PointerEvent) {
      pointerFromEvent(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(meshList(), false);
      const hit = hits.find((h) => h.object.visible)?.object as THREE.Mesh | undefined;
      const unitId = hit?.userData.unitId as string | undefined;
      if (!unitId) return;
      const box = unitBoxesRef.current.find((b) => b.unit.id === unitId);
      if (box && onSelectUnit) onSelectUnit(box.unit);
    }

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointermove", handleMove);
    renderer.domElement.addEventListener("click", handleClick);

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    let raf = 0;
    function animate() {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handleMove);
      renderer.domElement.removeEventListener("click", handleClick);
      controls.dispose();
      geometry.dispose();
      unitMeshesRef.current.forEach((mesh) => {
        (mesh.material as THREE.Material).dispose();
      });
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry !== geometry) obj.geometry.dispose();
        if (obj instanceof THREE.Mesh && obj.userData.isShell) {
          (obj.material as THREE.Material).dispose();
        }
      });
      (ground.material as THREE.Material).dispose();
      ground.geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      unitMeshesRef.current.clear();
      setReady(false);
    };
    // Geometry only depends on which project is loaded — config/selection
    // changes are applied in-place by the effects below instead of
    // triggering a full teardown/rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // --- Apply lighting/background/ground/camera-limit config without
  // rebuilding the scene ---
  useEffect(() => {
    const lights = lightsRef.current;
    const scene = sceneRef.current;
    const controls = controlsRef.current;
    if (!lights || !scene) return;

    scene.background = new THREE.Color(BACKGROUND_COLOR[config.backgroundPreset]);

    if (config.lightingPreset === "daylight") {
      lights.hemi.color.setHex(0xffffff);
      lights.hemi.groundColor.setHex(0x8a8a9a);
      lights.hemi.intensity = 1;
      lights.ambient.intensity = 0.2;
      lights.sun.color.setHex(0xffffff);
      lights.sun.intensity = 2.2;
      lights.sun.position.set(30, 45, 20);
    } else if (config.lightingPreset === "overcast") {
      lights.hemi.color.setHex(0xd7d9e0);
      lights.hemi.groundColor.setHex(0x9a9aa5);
      lights.hemi.intensity = 1.1;
      lights.ambient.intensity = 0.35;
      lights.sun.color.setHex(0xdfe3ea);
      lights.sun.intensity = 0.8;
      lights.sun.position.set(10, 40, 10);
    } else {
      lights.hemi.color.setHex(0xffcf9e);
      lights.hemi.groundColor.setHex(0x4a3a52);
      lights.hemi.intensity = 0.8;
      lights.ambient.intensity = 0.25;
      lights.sun.color.setHex(0xffa15c);
      lights.sun.intensity = 1.6;
      lights.sun.position.set(-35, 18, 25);
    }

    // The public viewer (showChrome) owns ground/shell visibility live via
    // the Landscape/Building Outline toggles below, seeded from these same
    // config defaults — only the Admin preview embed (no chrome, no
    // toggles) stays purely config-driven here.
    if (!showChrome) {
      if (groundRef.current) groundRef.current.visible = config.groundEnabled;
      const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
      shellsRef.current.forEach((shell) => {
        shell.visible = showShells;
      });
    }

    if (controls) {
      const layout = computeProjectLayout(project);
      controls.minDistance = layout.boundingRadius * config.cameraMinDistanceMultiplier;
      controls.maxDistance = layout.boundingRadius * config.cameraMaxDistanceMultiplier;
      controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
      controls.autoRotate = config.autoRotate;
    }
  }, [config, project, showChrome]);

  // --- Live scene controls (public viewer only) — Time of Day, Season,
  // Landscape, Building Outline. Layered on top of / overriding the
  // config-driven defaults above; the Admin preview (showChrome=false) never
  // runs these, so it stays exactly as before. ---
  useEffect(() => {
    if (!showChrome) return;
    const lights = lightsRef.current;
    const scene = sceneRef.current;
    if (!lights || !scene) return;

    // 6 = dawn, 14 = solar noon peak, 22 = late dusk — continuous
    // interpolation rather than the 3 discrete Admin presets, so the slider
    // actually feels like a clock rather than 3 snap points.
    const isNight = timeOfDay < 6.5 || timeOfDay > 21.5;
    const dayPhase = THREE.MathUtils.clamp(Math.sin(Math.PI * ((timeOfDay - 6) / 16)), 0, 1);

    const warm = new THREE.Color(0xffa15c);
    const white = new THREE.Color(0xffffff);
    const night = new THREE.Color(0x8fa3ff);

    lights.sun.color.copy(isNight ? night : warm.clone().lerp(white, dayPhase));
    lights.sun.intensity = isNight ? 0.15 : 0.6 + dayPhase * 1.8;
    lights.sun.position.set(30, isNight ? 6 : 10 + dayPhase * 55, 20);

    lights.hemi.intensity = isNight ? 0.35 : 0.7 + dayPhase * 0.4;
    lights.hemi.color.copy(isNight ? new THREE.Color(0x1a1f3a) : white.clone().lerp(warm, 1 - dayPhase));
    lights.ambient.intensity = isNight ? 0.12 : 0.2 + dayPhase * 0.15;

    const skyDay = new THREE.Color(0xbfe0ff);
    const skyDusk = new THREE.Color(0xffc98a);
    const skyNight = new THREE.Color(0x0c1024);
    scene.background = isNight ? skyNight : skyDusk.clone().lerp(skyDay, dayPhase);
  }, [timeOfDay, showChrome]);

  useEffect(() => {
    if (!showChrome || !groundRef.current) return;
    (groundRef.current.material as THREE.MeshStandardMaterial).color.setHex(SEASON_GROUND[season]);
  }, [season, showChrome]);

  useEffect(() => {
    if (!showChrome || !groundRef.current) return;
    groundRef.current.visible = landscapeVisible;
  }, [landscapeVisible, showChrome]);

  useEffect(() => {
    if (!showChrome) return;
    const showShells =
      project.status === "under_construction" && config.constructionStagesEnabled && outlineVisible;
    shellsRef.current.forEach((shell) => {
      shell.visible = showShells;
    });
  }, [outlineVisible, showChrome, project.status, config.constructionStagesEnabled]);

  /** Rotates the camera to one of the 8 compass points around the current
   * target, preserving distance/elevation — an orbit shortcut, not a real
   * geographic heading (see COMPASS_POINTS). */
  function setViewAngle(theta: number) {
    setCompassTheta(theta);
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta = THREE.MathUtils.degToRad(theta);
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  // --- Re-evaluate per-unit appearance whenever selection, filters or
  // construction progress change ---
  useEffect(() => {
    refreshAllAppearance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedUnitId,
    filter,
    activeBuilding,
    typeFilter,
    floorFilter,
    bedroomFilter,
    bathroomFilter,
    minArea,
    maxArea,
    constructionProgressPercent,
    config.constructionStagesEnabled,
  ]);

  function frameBuilding(name: string | "all") {
    setActiveBuilding(name);
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    const layout = computeProjectLayout(project);
    if (name === "all") {
      const start = defaultCameraRef.current;
      if (start) {
        camera.position.copy(start.position);
        controls.target.copy(start.target);
      }
    } else {
      const b = layout.buildings.find((bl) => bl.name === name);
      if (!b) return;
      const dist = Math.max(b.width, b.height) * 1.4 + 6;
      controls.target.set(b.centerX, b.height / 2, b.z);
      camera.position.set(b.centerX + dist * 0.6, b.height / 2 + dist * 0.5, b.z + dist * 0.9);
    }
    controls.update();
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

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
        <>
          {barOpen ? (
            <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:left-1/2 sm:max-w-[calc(100vw-1.5rem)] sm:-translate-x-1/2 sm:items-center">
              {/* Scene controls — Building / View Angle / Time of Day /
                  Season / Layers. All real: Building reuses frameBuilding's
                  existing camera framing, View Angle drives OrbitControls'
                  azimuthal angle, Time of Day continuously interpolates the
                  actual scene lights, Season retints the real ground
                  material, Layers toggles real mesh visibility. */}
              <div className="glass-panel-dark w-full rounded-panel px-4 py-3.5 sm:w-auto">
                <div className="flex flex-wrap gap-x-7 gap-y-4">
                  {project.buildings.length > 1 && (
                    <div className="min-w-[8rem]">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                        {t("unit.viewerBuilding")}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <RadioRow
                          label={t("project.allBuildingsRadio")}
                          active={activeBuilding === "all"}
                          onClick={() => frameBuilding("all")}
                        />
                        {project.buildings.map((b) => (
                          <RadioRow
                            key={b}
                            label={b}
                            active={activeBuilding === b}
                            onClick={() => frameBuilding(b)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      {t("project.viewAngle")}
                    </p>
                    <CompassWidget theta={compassTheta} onChange={setViewAngle} />
                  </div>

                  <div className="min-w-[11rem] flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      <span>{t("project.timeOfDay")}</span>
                      <span className="text-white/80">{formatHour(timeOfDay)}</span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={22}
                      step={0.5}
                      value={timeOfDay}
                      onChange={(e) => setTimeOfDay(Number(e.target.value))}
                      className="h-6 w-full accent-white"
                    />
                    <div className="mt-1 flex items-center justify-between px-0.5">
                      {TIME_PRESETS.map(({ hour, icon: Icon }) => (
                        <button
                          key={hour}
                          onClick={() => setTimeOfDay(hour)}
                          aria-label={formatHour(hour)}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full",
                            Math.abs(timeOfDay - hour) < 0.25 ? "text-brand-400" : "text-white/40 hover:text-white/70"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-[8rem]">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      {t("project.season")}
                    </p>
                    <DarkSelect
                      label=""
                      value={season}
                      onChange={(v) => setSeason(v as Season)}
                      options={(["spring", "summer", "autumn", "winter"] as Season[]).map(
                        (s): [string, string] => [s, t(SEASON_LABEL_KEY[s])]
                      )}
                      hideLabel
                    />
                  </div>

                  <div className="min-w-[9rem]">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      {t("project.layers")}
                    </p>
                    <div className="flex flex-col gap-2.5">
                      <ToggleRow label={t("project.landscape")} checked={landscapeVisible} onChange={setLandscapeVisible} />
                      {project.status === "under_construction" && config.constructionStagesEnabled && (
                        <ToggleRow
                          label={t("project.buildingOutline")}
                          checked={outlineVisible}
                          onChange={setOutlineVisible}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Filters — Use/Bedrooms/Bathrooms/Size/Floor/Availability,
                  all real fields on Unit, plus Reset and a live results
                  count computed from the same predicate that drives mesh
                  visibility. */}
              <div className="glass-panel-dark flex w-full flex-wrap items-end gap-4 rounded-panel px-4 py-3.5 sm:w-auto sm:flex-nowrap">
                <DarkSelect
                  label={t("unit.viewerUse")}
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as Unit["type"] | "all")}
                  options={[
                    ["all", t("unit.viewerFilterAll")],
                    ["residential", t("unit.typeResidential")],
                    ["commercial", t("unit.typeCommercial")],
                    ["parking", t("unit.typeParking")],
                    ["storage", t("unit.typeStorage")],
                  ]}
                />

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

                <div className="min-w-[9rem] flex-1 sm:flex-none sm:w-36">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    {t("unit.viewerSurface")}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={areaBounds.min}
                      max={areaBounds.max}
                      value={minArea ?? ""}
                      onChange={(e) => setMinArea(e.target.value === "" ? null : Number(e.target.value))}
                      placeholder={t("unit.viewerSizeMin")}
                      className="w-full rounded-control border border-white/15 bg-white/10 px-2 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                    />
                    <span className="text-white/30">–</span>
                    <input
                      type="number"
                      min={areaBounds.min}
                      max={areaBounds.max}
                      value={maxArea ?? ""}
                      onChange={(e) => setMaxArea(e.target.value === "" ? null : Number(e.target.value))}
                      placeholder={t("unit.viewerSizeMax")}
                      className="w-full rounded-control border border-white/15 bg-white/10 px-2 py-2 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>

                <DarkSelect
                  label={t("unit.viewerFloor")}
                  value={floorFilter == null ? "all" : String(floorFilter)}
                  onChange={(v) => setFloorFilter(v === "all" ? null : Number(v))}
                  options={[
                    ["all", t("unit.viewerFilterAll")],
                    ...floorOptions.map((f): [string, string] => [String(f), t("unit.floorLabel", { n: f })]),
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

                <div className="ml-auto flex shrink-0 items-center gap-3 self-center">
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("unit.viewerReset")}
                  </button>
                  <span className="whitespace-nowrap text-xs font-semibold text-white/80">
                    {t("unit.viewerResults", { count: visibleCount })}
                  </span>
                  <button
                    onClick={() => setBarOpen(false)}
                    aria-label={t("common.close")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setBarOpen(true)}
              className="glass-panel-dark absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-pill px-4 py-2.5 text-xs font-semibold text-white"
            >
              {t("unit.viewerShowFilters")}
            </button>
          )}

          {/* Fullscreen (PRD §6/§7.1) — the old floating "reset camera"
              compass button is gone; the Building panel's "All Buildings"
              radio + View Angle panel now cover that same job. */}
          <div className="absolute bottom-4 right-4 z-10">
            <button
              onClick={toggleFullscreen}
              aria-label={t("unit.viewerFullscreen")}
              className="glass-panel-dark flex h-8 w-8 items-center justify-center rounded-full text-white/80"
            >
              {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
});

/** A single "LABEL / ALL ⌃" control in the bottom filter bar. */
function DarkSelect({
  label,
  value,
  onChange,
  options,
  dotColor,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  /** Tints the pill to match the currently selected availability status. */
  dotColor?: number;
  /** Skip the internal caption when the caller already renders its own
   * section label above (e.g. the scene-controls panel's Season column). */
  hideLabel?: boolean;
}) {
  return (
    <label className="block min-w-[6.5rem] flex-1 sm:flex-none">
      {!hideLabel && (
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-white/50">
          {label}
        </span>
      )}
      <span className="relative block">
        {dotColor != null && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
            style={{ background: `#${dotColor.toString(16).padStart(6, "0")}` }}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-control border border-white/15 bg-white/10 py-2 pr-8 text-xs font-semibold uppercase text-white focus:border-white/40 focus:outline-none",
            dotColor != null ? "pl-7" : "pl-3"
          )}
        >
          {options.map(([v, l]) => (
            <option key={v} value={v} className="text-neutral-900">
              {l}
            </option>
          ))}
        </select>
        <ChevronUp className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
      </span>
    </label>
  );
}

const SEASON_LABEL_KEY: Record<Season, string> = {
  spring: "project.seasonSpring",
  summer: "project.seasonSummer",
  autumn: "project.seasonAutumn",
  winter: "project.seasonWinter",
};

const TIME_PRESETS: { hour: number; icon: typeof Sun }[] = [
  { hour: 7, icon: Sunrise },
  { hour: 11, icon: Sun },
  { hour: 14, icon: Sun },
  { hour: 18.5, icon: Sunset },
  { hour: 21, icon: Moon },
];

function formatHour(h: number): string {
  const hour24 = Math.floor(h);
  const minutes = Math.round((h - hour24) * 60);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** A single "○ Tower A" row in the Building panel. */
function RadioRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-left text-xs text-white/70 hover:text-white">
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          active ? "border-brand-400" : "border-white/30"
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
      </span>
      <span className={active ? "text-white" : undefined}>{label}</span>
    </button>
  );
}

/** A single Layers row — label + switch. */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-white/70">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-500" : "bg-white/15"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}

/** 8-way compass dial — click a point to orbit the camera there (see
 * setViewAngle). Purely a UI ring; its layout isn't tied to Three.js'
 * Spherical.theta convention, only the resulting camera call is real. */
function CompassWidget({ theta, onChange }: { theta: number; onChange: (theta: number) => void }) {
  return (
    <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 rounded-full border border-white/15">
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
      {COMPASS_POINTS.map((p) => {
        const rad = (p.theta * Math.PI) / 180;
        const x = 50 + 40 * Math.cos(rad);
        const y = 50 - 40 * Math.sin(rad);
        const active = theta === p.theta;
        return (
          <button
            key={p.label}
            onClick={() => onChange(p.theta)}
            aria-pressed={active}
            aria-label={p.label}
            style={{ left: `${x}%`, top: `${y}%` }}
            className={cn(
              "absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold",
              active ? "bg-brand-500 text-white" : "text-white/50 hover:text-white"
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
