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
import { Box, ChevronUp, Compass, Expand, Minimize, X } from "lucide-react";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { Project, Project3DConfig, Unit } from "@/lib/types";

export interface ThreeProjectViewerHandle {
  /** PRD §7.1/§16 — "Reset returns to Admin-saved starting camera." */
  resetView: () => void;
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
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
  const [minArea, setMinArea] = useState<number | null>(null);
  const [barOpen, setBarOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const { t } = useT();

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

  useImperativeHandle(ref, () => ({ resetView: resetCamera }));

  function applyUnitAppearance(mesh: THREE.Mesh, box: UnitBox) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const isSelected = box.unit.id === selectedUnitId;
    const isHovered = box.unit.id === hoveredIdRef.current;
    material.color.setHex(isSelected ? SELECTED_COLOR : STATUS_COLOR[box.unit.status]);
    material.emissive.setHex(isSelected ? SELECTED_COLOR : isHovered ? 0x333333 : 0x000000);
    material.emissiveIntensity = isSelected ? 0.35 : isHovered ? 0.5 : 0;

    const passesFilter = filter === "all" || box.unit.status === filter;
    const passesBuilding = activeBuilding === "all" || box.buildingName === activeBuilding;
    const passesBedrooms = bedroomFilter == null || box.unit.bedrooms >= bedroomFilter;
    const passesBathrooms = bathroomFilter == null || box.unit.bathrooms >= bathroomFilter;
    const passesArea = minArea == null || box.unit.area >= minArea;
    const progress = constructionProgressPercent ?? project.progressPercent;
    const isBuilt =
      !config.constructionStagesEnabled ||
      project.status !== "under_construction" ||
      box.floorIndex / Math.max(1, box.totalFloorsInBuilding) <= progress / 100;
    mesh.visible =
      passesFilter && passesBuilding && passesBedrooms && passesBathrooms && passesArea && isBuilt;
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

    if (groundRef.current) groundRef.current.visible = config.groundEnabled;

    const showShells = project.status === "under_construction" && config.constructionStagesEnabled;
    shellsRef.current.forEach((shell) => {
      shell.visible = showShells;
    });

    if (controls) {
      const layout = computeProjectLayout(project);
      controls.minDistance = layout.boundingRadius * config.cameraMinDistanceMultiplier;
      controls.maxDistance = layout.boundingRadius * config.cameraMaxDistanceMultiplier;
      controls.maxPolarAngle = THREE.MathUtils.degToRad(config.cameraMaxPolarDeg);
      controls.autoRotate = config.autoRotate;
    }
  }, [config, project]);

  // --- Re-evaluate per-unit appearance whenever selection, filters or
  // construction progress change ---
  useEffect(() => {
    refreshAllAppearance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedUnitId,
    filter,
    activeBuilding,
    bedroomFilter,
    bathroomFilter,
    minArea,
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
          {/* Unified filter bar (PRD §6/§8/§9) — surface/bedroom/bathroom/
              building/availability in one collapsible strip, closable like
              a real control rather than several separate floating panels. */}
          {barOpen ? (
            <div className="glass-panel-dark absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-end gap-4 rounded-panel px-4 py-3.5 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:flex-nowrap">
              <div className="min-w-[9rem] flex-1 sm:flex-none sm:w-40">
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

              {project.buildings.length > 1 && (
                <DarkSelect
                  label={t("unit.viewerBuilding")}
                  value={activeBuilding}
                  onChange={(v) => frameBuilding(v)}
                  options={[
                    ["all", t("unit.allBuildings")],
                    ...project.buildings.map((b): [string, string] => [
                      b,
                      t("unit.buildingLabel", { name: b }),
                    ]),
                  ]}
                />
              )}

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
                onClick={() => setBarOpen(false)}
                aria-label={t("common.close")}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setBarOpen(true)}
              className="glass-panel-dark absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-pill px-4 py-2.5 text-xs font-semibold text-white"
            >
              {t("unit.viewerShowFilters")}
            </button>
          )}

          {/* Home view / fullscreen (PRD §6/§7.1) */}
          <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-2">
            <button
              onClick={resetCamera}
              aria-label={t("project.resetExteriorView")}
              className="glass-panel-dark flex h-11 w-11 items-center justify-center rounded-full text-white"
            >
              <Compass className="h-5 w-5" />
            </button>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  /** Tints the pill to match the currently selected availability status. */
  dotColor?: number;
}) {
  return (
    <label className="block min-w-[6.5rem] flex-1 sm:flex-none">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-white/50">
        {label}
      </span>
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
