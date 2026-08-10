"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

const GRID_SIZE_M = 100;
const GRID_DIVISIONS = 20; // 5m per square — a person is roughly one square tall.

/**
 * Standalone Three.js preview for Admin's "3D Map Control" GLB upload — a
 * 5m-grid ground plane is the only reliable way to judge whether an
 * arbitrary GLB (authored at who-knows-what scale) will read at real-world
 * size once placed on the map, before it ever touches mapbox-gl. Scale/
 * rotation/altitude mirror exactly what ProjectModelLayer applies on the
 * live map, so what Admin sees here is what ships.
 */
export function GlbPreviewCanvas({
  blobUrl,
  scale,
  rotationDeg,
  altitudeOffset,
  className,
}: {
  blobUrl: string | null;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { t } = useT();

  // --- Scene/renderer lifecycle (re-created per container mount only) ---
  const sceneRef = useRef<THREE.Scene | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1a24);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      2000
    );
    camera.position.set(30, 26, 40);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(40, 60, 20);
    scene.add(sun);

    const grid = new THREE.GridHelper(GRID_SIZE_M, GRID_DIVISIONS, 0x6b55f5, 0x3a3946);
    scene.add(grid);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      disposeObject3D(scene);
      sceneRef.current = null;
      modelGroupRef.current = null;
    };
  }, []);

  // --- Load/replace the GLB whenever the blob URL changes ---
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;
    // Clear whatever was loaded before.
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeObject3D(child);
    }
    setLoadError(false);
    if (!blobUrl) return;

    const loader = new GLTFLoader();
    let cancelled = false;
    loader.load(
      blobUrl,
      (gltf) => {
        if (cancelled) return;
        group.add(gltf.scene);
      },
      undefined,
      () => {
        if (!cancelled) setLoadError(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [blobUrl, setLoadError]);

  // --- Keep scale/rotation/altitude in sync without reloading the model ---
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;
    group.scale.setScalar(scale);
    group.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
    group.position.y = altitudeOffset;
  }, [scale, rotationDeg, altitudeOffset]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!blobUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/40">
          {t("admin.mapModelNoUpload")}
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm text-red-300">
          {t("admin.mapModelLoadError")}
        </div>
      )}
    </div>
  );
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => mat.dispose());
    }
  });
}
