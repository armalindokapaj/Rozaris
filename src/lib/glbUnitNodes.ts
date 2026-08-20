import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { cleanGlbNodeName } from "@/lib/glbNodeName";
import type { Unit } from "@/lib/types";

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

/** Overrides every mesh under `node` (itself, or its mesh descendants if
 * it's a Group) with a translucent, non-depth-writing MeshBasicMaterial —
 * the "80% transparent colored box" look for a detail GLB's `Unit_<number>`
 * nodes. Moved here (was DetailModelLayer.ts's private helper, now
 * retired) since ProceduralProjectViewer.tsx is the one real GLB-rendering
 * viewer as of "3D Experience Phase 1".
 *
 * `cache`/`cacheKey` (Phase 3, UnitManager fix): unit-box appearance only
 * varies across a small, finite state space — `(status, selected, hovered,
 * xray)`, at most ~24 combinations — but this function used to allocate a
 * fresh `MeshBasicMaterial` and dispose the previous one on every call,
 * including every single hover-in/hover-out frame over a GLB unit box
 * (`RenderEngine.ts`'s `refreshGlbUnitBoxAppearance`, called from
 * `handleMove`). When a cache + key are supplied, an existing material for
 * that exact `(color, opacity)` combination is reused instead of
 * reallocated — real fix for a confirmed GC-churn problem. Callers that
 * omit the cache keep the original dispose-and-recreate behavior
 * (backward compatible, not a breaking change to this function's
 * contract). */
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
    // Only dispose the previous material when NOT using the cache — a
    // cached material may still be assigned to other meshes/nodes, so
    // disposing it here would pull the rug out from under them. The
    // no-cache path is unchanged from the original behavior.
    if (!cache) {
      if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
      else prev?.dispose();
    }
    mesh.material = material;
  });
}

/** Strips a leading `Unit_`/`UNIT_` prefix and every non-alphanumeric
 * character, then lowercases — e.g. both "Unit_A503" and "UNIT_A-503"
 * normalize to "a503", matching a `Unit.code` of "A503" or "A-503". Shared
 * by `autoMatchUnitNodes` below (comparing a mesh name) and its caller
 * (comparing a `Unit.code`) so both sides of the comparison go through the
 * exact same rule. */
export function normalizeUnitMatchKey(value: string): string {
  return value.replace(/^unit_?/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Auto-links detected GLB node names to real Units by comparing normalized
 * names (see `normalizeUnitMatchKey`) — PRD §43 "Auto Match". Fills ONLY
 * currently-unlinked selections; a mesh name already present in
 * `currentSelections` (whether picked manually, confirmed, or carried
 * forward from a prior version) is left untouched, never silently
 * reassigned. Pure — returns a new object, doesn't mutate `currentSelections`. */
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
