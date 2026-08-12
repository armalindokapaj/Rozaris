import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";

const UNIT_NODE_PATTERN = /^Unit_/i;

/**
 * Loads a detailed GLB just far enough to read its scene-graph node names —
 * used by Project3DConfigEditor right after an upload (and whenever an
 * existing detail model is opened) to detect the `Unit_<number>` boxes the
 * 3D artist baked in, so Admin can link each one to a real Unit. This is a
 * throwaway loader/scene, not the one that ends up rendered —
 * ProceduralProjectViewer.tsx does its own load for the live viewer.
 */
export async function extractUnitNodeNames(glbUrl: string): Promise<string[]> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  try {
    const gltf = await loader.loadAsync(glbUrl);
    const names = new Set<string>();
    gltf.scene.traverse((child) => {
      if (child.name && UNIT_NODE_PATTERN.test(child.name)) {
        names.add(child.name);
      }
    });
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  } finally {
    dracoLoader.dispose();
  }
}

/** Overrides every mesh under `node` (itself, or its mesh descendants if
 * it's a Group) with a translucent, non-depth-writing MeshBasicMaterial —
 * the "80% transparent colored box" look for a detail GLB's `Unit_<number>`
 * nodes, applied fresh each call rather than mutating a shared material
 * instance. Moved here (was DetailModelLayer.ts's private helper, now
 * retired) since ProceduralProjectViewer.tsx is the one real GLB-rendering
 * viewer as of "3D Experience Phase 1". */
export function applyUnitBoxMaterial(node: THREE.Object3D, color: number, opacity: number) {
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const prev = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
    else prev?.dispose();
    mesh.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
  });
}

/** Disposes every geometry/material under a loaded GLB root before
 * discarding it (on unmount, project switch, or GLB replacement). */
export function disposeGlbObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => mat.dispose());
    }
  });
}
