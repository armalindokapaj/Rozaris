import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { cleanGlbNodeName } from "@/lib/glbNodeName";
import type { Unit } from "@/lib/types";

const UNIT_NODE_PATTERN = /^Unit_/i;

export async function extractUnitNodeNames(glbUrl: string): Promise<string[]> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  try {
    const gltf = await loader.loadAsync(glbUrl);
    const names = new Set<string>();
    gltf.scene.traverse((child) => {
      const name = cleanGlbNodeName(child.name);
      if (name && UNIT_NODE_PATTERN.test(name)) {
        names.add(name);
      }
    });
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  } finally {
    dracoLoader.dispose();
  }
}

export function applyUnitBoxMaterial(
  node: THREE.Object3D,
  color: number,
  opacity: number,
  cache?: Map<string, THREE.MeshBasicMaterial>,
  cacheKey?: string
) {
  let material: THREE.MeshBasicMaterial | undefined;
  if (cache && cacheKey) {
    material = cache.get(cacheKey);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      cache.set(cacheKey, material);
    }
  } else {
    material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  }
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const prev = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!cache) {
      if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
      else prev?.dispose();
    }
    mesh.material = material;
  });
}

export function normalizeUnitMatchKey(value: string): string {
  return value.replace(/^unit_?/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function autoMatchUnitNodes(
  detectedNodes: string[],
  units: Pick<Unit, "id" | "code">[],
  currentSelections: Record<string, string>
): Record<string, string> {
  const next = { ...currentSelections };
  for (const meshName of detectedNodes) {
    if (next[meshName]) continue;
    const key = normalizeUnitMatchKey(meshName);
    const match = units.find((u) => normalizeUnitMatchKey(u.code) === key);
    if (match) next[meshName] = match.id;
  }
  return next;
}

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
