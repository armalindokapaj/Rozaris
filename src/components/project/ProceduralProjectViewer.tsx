"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Home, Palette, Search, Sun, X } from "lucide-react";
import { computeProjectLayout, type UnitBox } from "@/lib/threeBuilding";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_COLOR,
  GROUND_COLOR,
  SELECTED_COLOR,
  STATUS_COLOR,
  TIME_PRESETS,
  VIEW_PRESETS,
  VIEW_PRESET_MATERIAL,
  defaultHourForPreset,
  type ViewPreset,
} from "@/lib/viewerPresets";
import { DarkSelect, MenuIconButton, formatHour } from "./ViewerChrome";
import type { Unit } from "@/lib/types";
import type { ThreeProjectViewerHandle, ThreeProjectViewerProps } from "./viewerTypes";

type AvailabilityFilter = "all" | Unit["status"];

/**
 * Pure Three.js project viewer (PRD_3D_Project_Viewer). Renders only the
 * selected project's building(s) on a minimal platform — no surrounding
 * city — using OrbitControls for navigation and a Raycaster for unit
 * picking, per the PRD's Three.js technology baseline (§3). Building
 * geometry is procedural (lib/threeBuilding.ts), not a loaded GLB/glTF.
 *
 * This is the fallback path for any project that hasn't had a detailed GLB
 * uploaded (or enabled) via Admin's "Project 3D Experience" editor — see
 * ThreeProjectViewer.tsx, the dispatcher that picks between this component
 * and MapboxProjectViewer.tsx (the live-Mapbox path for projects that have
 * one). This file is otherwise unchanged from before that split.
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
    // One LineSegments edge-outline per unit, parented to its mesh so it
    // inherits position/scale automatically — created once, just toggled
    // visible/hidden per View Preset rather than rebuilt on every switch.
    const unitEdgesRef = useRef<Map<string, THREE.LineSegments>>(new Map());
    const shellsRef = useRef<THREE.Mesh[]>([]);
    const unitBoxesRef = useRef<UnitBox[]>([]);
    const hoveredIdRef = useRef<string | null>(null);
    const defaultCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(
      null
    );

    const [ready, setReady] = useState(false);
    const [webglFailReason, setWebglFailReason] = useState<string | null>(null);
    const [filter, setFilter] = useState<AvailabilityFilter>("all");
    const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
    const [bathroomFilter, setBathroomFilter] = useState<number | null>(null);
    const [minArea, setMinArea] = useState<number | null>(null);
    // Only one of these is ever open at once — the bottom menu is either the
    // icon-only row, or one expanded panel; there's no "both" state.
    const [panel, setPanel] = useState<"search" | "time" | "viewPreset" | null>(null);
    // Live scene controls — user-side, on top of Admin config's initial
    // defaults (see the dedicated effect below).
    const [timeOfDay, setTimeOfDay] = useState(() => defaultHourForPreset(config.lightingPreset));
    const [sunAzimuth, setSunAzimuth] = useState(215);
    const [viewPreset, setViewPreset] = useState<ViewPreset>("realistic");
    const { t } = useT();

    function matchesFilters(u: Unit): boolean {
      if (filter !== "all" && u.status !== filter) return false;
      if (bedroomFilter != null && u.bedrooms < bedroomFilter) return false;
      if (bathroomFilter != null && u.bathrooms < bathroomFilter) return false;
      if (minArea != null && u.area < minArea) return false;
      return true;
    }

    // Reports "is a panel expanded" (more bottom-of-viewport height in use),
    // not the old barOpen concept — same callback contract ArchVizClient
    // already reads for its "explore units" CTA clearance.
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
      camera.position.copy(start.position);
      controls.target.copy(start.target);
      controls.update();
    }

    /** North Sign — rotates the camera to a canonical "north" heading
     * (theta=0) around the current target, keeping distance/elevation. Real
     * camera math, though — same as resetCamera — this procedural scene has
     * no actual geographic orientation to align to. */
    function resetToNorth() {
      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!controls || !camera) return;
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta = 0;
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }

    useImperativeHandle(ref, () => ({
      resetView: resetCamera,
      captureScreenshot: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        // Force one synchronous render right before reading the buffer —
        // the animate() loop's last frame is usually still there, but
        // capturing right after a fresh render removes any doubt.
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
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

      // preserveDrawingBuffer: without it, the browser is free to clear the
      // WebGL drawing buffer right after it's presented — toDataURL() then
      // reads a blank/cleared buffer instead of the last rendered frame,
      // which is exactly why the Screenshot button was producing empty PNGs.
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
      // Shared by every unit's edge outline (View Preset: Conceptual/Sketch)
      // — one LineSegments per unit, parented to its mesh so it inherits that
      // mesh's own scale/position instead of needing per-unit geometry.
      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      unitMeshesRef.current = new Map();
      unitEdgesRef.current = new Map();
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

        const edges = new THREE.LineSegments(
          edgeGeometry,
          new THREE.LineBasicMaterial({ color: 0x2a2a33, transparent: true, opacity: 0 })
        );
        edges.visible = false;
        mesh.add(edges);
        unitEdgesRef.current.set(box.unit.id, edges);
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
        edgeGeometry.dispose();
        unitMeshesRef.current.forEach((mesh) => {
          (mesh.material as THREE.Material).dispose();
        });
        unitEdgesRef.current.forEach((edges) => {
          (edges.material as THREE.Material).dispose();
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
        unitEdgesRef.current.clear();
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

    // --- Time of Day + Sun Orientation (public viewer only) — continuous
    // interpolation of the real scene lights, overriding the config-driven
    // preset above; the Admin preview (showChrome=false) never runs this, so
    // it stays exactly as before. ---
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

      const elevation = isNight ? 6 : 10 + dayPhase * 55;
      const azimuthRad = THREE.MathUtils.degToRad(sunAzimuth);
      lights.sun.color.copy(isNight ? night : warm.clone().lerp(white, dayPhase));
      lights.sun.intensity = isNight ? 0.15 : 0.6 + dayPhase * 1.8;
      lights.sun.position.set(Math.cos(azimuthRad) * 40, elevation, Math.sin(azimuthRad) * 40);

      lights.hemi.intensity = isNight ? 0.35 : 0.7 + dayPhase * 0.4;
      lights.hemi.color.copy(isNight ? new THREE.Color(0x1a1f3a) : white.clone().lerp(warm, 1 - dayPhase));
      lights.ambient.intensity = isNight ? 0.12 : 0.2 + dayPhase * 0.15;

      const skyDay = new THREE.Color(0xbfe0ff);
      const skyDusk = new THREE.Color(0xffc98a);
      const skyNight = new THREE.Color(0x0c1024);
      scene.background = isNight ? skyNight : skyDusk.clone().lerp(skyDay, dayPhase);
    }, [timeOfDay, sunAzimuth, showChrome]);

    // --- Re-evaluate per-unit appearance whenever selection, filters or
    // construction progress change ---
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
                <MenuIconButton icon={Home} label={t("project.home")} onClick={resetCamera} />
                <MenuIconButton
                  icon={Search}
                  label={t("unit.viewerUnitSearch")}
                  onClick={() => setPanel("search")}
                />
                <MenuIconButton icon={Sun} label={t("project.timeOfDay")} onClick={() => setPanel("time")} />
                <MenuIconButton
                  icon={Palette}
                  label={t("project.viewPreset")}
                  onClick={() => setPanel("viewPreset")}
                />
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
                  <DarkSelect
                    label={t("project.preset")}
                    value=""
                    onChange={(v) => setTimeOfDay(Number(v))}
                    options={[["", t("project.preset")], ...TIME_PRESETS.map(([key, hour]): [string, string] => [String(hour), t(key)])]}
                  />
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
                    onChange={(e) => setTimeOfDay(Number(e.target.value))}
                    className="h-6 w-full accent-white"
                  />
                </div>

                <div className="min-w-[10rem] flex-1">
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    <span>{t("project.sunOrientation")}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={5}
                    value={sunAzimuth}
                    onChange={(e) => setSunAzimuth(Number(e.target.value))}
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
          </div>
        )}
      </div>
    );
  }
);
