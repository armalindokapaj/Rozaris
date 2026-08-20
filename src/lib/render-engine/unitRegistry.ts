import * as THREE from "three/webgpu";
import type { Unit, UnitMeshLink, UnitsConfig } from "@/lib/types";
import { unitSelectedOutlineColorNumber, unitStatusColorNumber } from "@/lib/unitStatusVisuals";
import { cleanGlbNodeName } from "@/lib/glbNodeName";

const UNIT_NODE_PATTERN = /^Unit_/i;

/** Units Blocks & POI Layer PRD §10 — the runtime, per-unit record the
 * engine builds once a GLB (or several) is loaded and unit links are
 * resolved. Consumed by the raycaster (§19), focusUnit() (§16-17), and
 * status-filter/visibility toggles (§13) — none of them re-traverse the
 * whole scene graph on every interaction. */
export interface UnitRuntimeEntry {
  unitId: string;
  unitCode: string;
  status: Unit["status"];
  /** The topmost `Unit_<code>` node itself — a lone mesh for the simple
   * case, a Group for a multi-mesh unit volume. */
  rootObject: THREE.Object3D;
  /** Every real mesh descendant of `rootObject` — what actually gets a
   * material/outline applied and what the raycaster tests against. */
  meshes: THREE.Mesh[];
  worldBounds: THREE.Box3;
  worldCenter: THREE.Vector3;
  worldBoundingSphere: THREE.Sphere;
  poiYawDeg: number;
  poiEnabled: boolean;
  poiDistanceOverride: number | null;
  poiHeightOverride: number | null;
}

/** Units Blocks & POI Layer PRD §9 — "Fix Unit root detection." The old
 * code (`RenderEngine.applyUnitBoxes`, pre this module) tested each
 * individual MESH's own name against `Unit_*` — correct for a GLB where
 * every unit is a single flat mesh, but silently blind to a
 * `Unit_A-101` Group containing child meshes like `Box001`/`Box002`
 * (their own names don't match, so they were skipped entirely: detected
 * by the editor's extractUnitNodeNames — which walks every node, not
 * just meshes — but never actually rendered/tinted).
 *
 * This finds the topmost `Unit_*`-named node under `root` (root itself
 * included) and treats it as one unit's whole interaction volume,
 * regardless of whether it's a single mesh or a Group of several — same
 * traversal shape `glbUnitNodes.ts`'s `applyUnitBoxMaterial` already used
 * correctly for its own (non-registry) callers. Stops descending once a
 * match is found so a nested `Unit_*` inside another `Unit_*` (shouldn't
 * happen in a valid GLB, but not this function's job to validate) doesn't
 * get double-registered. */
export function findUnitRootObjects(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const roots = new Map<string, THREE.Object3D>();
  function walk(node: THREE.Object3D) {
    const name = cleanGlbNodeName(node.name);
    if (UNIT_NODE_PATTERN.test(name)) {
      if (!roots.has(name)) roots.set(name, node);
      return; // don't descend into a matched root looking for nested matches
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return roots;
}

function collectMeshes(node: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  node.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

/** Builds/refreshes the unit registry from every currently-loaded root's
 * detected Unit_* roots + this version's confirmed mesh→unit links + the
 * live Postgres units list. Pure aggregation — doesn't touch materials or
 * scene graph membership; `applyUnitBoxAppearance` below does that. Called
 * whenever the underlying GLB(s), links, or units list change; cheap
 * (bounding-box math + map builds) to call after every live status poll
 * too (PRD §22). */
export function buildUnitRegistry(
  rootObjectsByName: Map<string, THREE.Object3D>,
  unitLinks: UnitMeshLink[],
  unitsById: Map<string, Unit>,
  poiByUnitId: Map<string, { poiYawDeg: number; poiEnabled: boolean; poiDistanceOverride: number | null; poiHeightOverride: number | null }>
): Map<string, UnitRuntimeEntry> {
  const registry = new Map<string, UnitRuntimeEntry>();
  for (const link of unitLinks) {
    const rootObject = rootObjectsByName.get(link.meshName);
    const unit = unitsById.get(link.unitId);
    if (!rootObject || !unit) continue; // unmapped mesh, or link points at a unit not in the live list
    const worldBounds = new THREE.Box3().setFromObject(rootObject);
    const worldCenter = worldBounds.getCenter(new THREE.Vector3());
    const worldBoundingSphere = worldBounds.getBoundingSphere(new THREE.Sphere());
    const poi = poiByUnitId.get(unit.id);
    registry.set(unit.id, {
      unitId: unit.id,
      unitCode: unit.code,
      status: unit.status,
      rootObject,
      meshes: collectMeshes(rootObject),
      worldBounds,
      worldCenter,
      worldBoundingSphere,
      poiYawDeg: poi?.poiYawDeg ?? 0,
      poiEnabled: poi?.poiEnabled ?? true,
      poiDistanceOverride: poi?.poiDistanceOverride ?? null,
      poiHeightOverride: poi?.poiHeightOverride ?? null,
    });
  }
  return registry;
}

export type UnitBoxAppearanceConfig = Pick<
  UnitsConfig,
  | "unitBlocksEnabled"
  | "unitBlocksStatusColorsEnabled"
  | "unitBlocksXrayEnabled"
  | "unitBlocksDefaultOpacity"
  | "unitBlocksHoverOpacity"
  | "unitBlocksSelectedOpacity"
  | "unitBlocksSelectedOutlineEnabled"
  | "unitColorAvailable"
  | "unitColorReserved"
  | "unitColorSold"
  | "unitColorSelected"
>;

function materialCacheKey(color: number, opacity: number, depthTest: boolean): string {
  return `${color}|${opacity}|${depthTest}`;
}

/** Units Blocks & POI Layer PRD §11-12 — the real X-ray overlay material,
 * plus a purple selection OUTLINE (not a full-color replacement — a sold
 * unit stays visibly red/sold even while selected, per §12's explicit
 * "do NOT make the unit opaque" / "do NOT replace status color on
 * select"). Reapplies to every mesh in every registry entry; unlinked
 * `Unit_*` meshes (present in the GLB but with no confirmed mapping) fall
 * back to their cached original material, same as before this module
 * existed.
 *
 * `materialCache` — Units Manager perf fix (see
 * `rozaris-3d-phase3-unitmanager-inventory` memory): the pre-rebuild
 * engine once fixed a real GC-churn bug (a fresh MeshBasicMaterial
 * allocated + disposed on every single hover-in/hover-out frame) via a
 * small `Map` keyed by the material's own (color, opacity, depthTest)
 * combination — lost when RenderEngine.ts was fully deleted and rebuilt
 * from scratch for Experience Editor v2 (the rebuilt `applyUnitBoxes` this
 * module replaces had reintroduced the same dispose-and-reallocate-every-
 * call pattern). Reinstated here rather than left as a fresh regression.
 *
 * `originalMaterials` / `outlineByMesh` are owned by RenderEngine (a
 * WeakMap survives across calls, tied to each Mesh's own lifetime) and
 * passed in rather than module-local, so restoring a mesh's original
 * material still works exactly as it did before this code moved here. */
export function applyUnitBoxAppearance(
  rootObjectsByName: Map<string, THREE.Object3D>,
  unitLinks: UnitMeshLink[],
  unitsById: Map<string, Unit>,
  statusColorsAllowed: boolean,
  selectedUnitId: string | null,
  hoveredUnitId: string | null,
  config: UnitBoxAppearanceConfig,
  originalMaterials: WeakMap<THREE.Mesh, THREE.Material[]>,
  materialCache: Map<string, THREE.MeshBasicMaterial>,
  outlineByMesh: Map<THREE.Mesh, THREE.LineSegments>
): THREE.Mesh[] {
  const linkByMesh = new Map(unitLinks.map((l) => [l.meshName, l.unitId]));
  const raycastTargets: THREE.Mesh[] = [];
  const statusColorsEnabled = statusColorsAllowed && config.unitBlocksStatusColorsEnabled;

  function normalizeMaterials(m: THREE.Material | THREE.Material[]): THREE.Material[] {
    return Array.isArray(m) ? m : [m];
  }

  function clearOutline(mesh: THREE.Mesh) {
    const outline = outlineByMesh.get(mesh);
    if (!outline) return;
    mesh.remove(outline);
    outline.geometry.dispose();
    (outline.material as THREE.Material).dispose();
    outlineByMesh.delete(mesh);
  }

  for (const [meshName, rootObject] of rootObjectsByName) {
    const linkedUnitId = linkByMesh.get(meshName);
    const unit = config.unitBlocksEnabled ? unitsById.get(linkedUnitId ?? "") : undefined;
    const isSelected = selectedUnitId != null && linkedUnitId === selectedUnitId;
    const isHovered = hoveredUnitId != null && linkedUnitId === hoveredUnitId;

    for (const mesh of collectMeshes(rootObject)) {
      if (!originalMaterials.has(mesh)) {
        originalMaterials.set(mesh, normalizeMaterials(mesh.material));
      }
      const originals = originalMaterials.get(mesh)!;
      // §28 — Units GLB materials are ignored, and unit boxes must never
      // influence real ArchViz lighting/shadowing regardless of what the
      // slot-level castShadow/receiveShadow switches say.
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      // §9/§19 — every descendant mesh of a matched Unit_* root carries
      // its own unitId/root-name, so the raycaster (which only sees the
      // intersected MESH, never which root it came from) can resolve a
      // hit back to a real unit in O(1) instead of re-searching the
      // registry by object identity.
      if (unit && linkedUnitId) {
        mesh.userData.isUnitBlock = true;
        mesh.userData.unitRootName = meshName;
        mesh.userData.unitId = linkedUnitId;
        if (config.unitBlocksEnabled) raycastTargets.push(mesh);
      } else {
        delete mesh.userData.isUnitBlock;
        delete mesh.userData.unitRootName;
        delete mesh.userData.unitId;
      }

      const currentIsOriginal = normalizeMaterials(mesh.material).every((m, i) => m === originals[i]);
      const showTint = !!unit && (statusColorsEnabled || isSelected || isHovered);

      if (!showTint) {
        if (!currentIsOriginal) {
          normalizeMaterials(mesh.material).forEach((m) => m.dispose());
          mesh.material = originals.length === 1 ? originals[0] : originals;
        }
        clearOutline(mesh);
        continue;
      }

      const color = unitStatusColorNumber(unit!.status, config);
      const opacity = isSelected
        ? config.unitBlocksSelectedOpacity
        : isHovered
          ? config.unitBlocksHoverOpacity
          : config.unitBlocksDefaultOpacity;
      const depthTest = !config.unitBlocksXrayEnabled;
      const key = materialCacheKey(color, opacity, depthTest);
      let material = materialCache.get(key);
      if (!material) {
        material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest });
        materialCache.set(key, material);
      }
      if (!currentIsOriginal && mesh.material !== material) {
        normalizeMaterials(mesh.material).forEach((m) => {
          if (m !== material) m.dispose();
        });
      }
      mesh.material = material;

      // §12 — selection keeps the status-color fill and gains a purple
      // edge outline instead of replacing the fill outright.
      if (isSelected && config.unitBlocksSelectedOutlineEnabled) {
        let outline = outlineByMesh.get(mesh);
        const outlineColor = unitSelectedOutlineColorNumber(config);
        if (!outline) {
          const edges = new THREE.EdgesGeometry(mesh.geometry);
          outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: outlineColor, depthTest }));
          mesh.add(outline);
          outlineByMesh.set(mesh, outline);
        } else {
          (outline.material as THREE.LineBasicMaterial).color.setHex(outlineColor);
          (outline.material as THREE.LineBasicMaterial).depthTest = depthTest;
        }
      } else {
        clearOutline(mesh);
      }
    }
  }

  return raycastTargets;
}

/** Disposes every cached unit-box material/outline — called from
 * RenderEngine.dispose() alongside its other cache teardown. */
export function disposeUnitBoxAppearanceCaches(
  materialCache: Map<string, THREE.MeshBasicMaterial>,
  outlineByMesh: Map<THREE.Mesh, THREE.LineSegments>
) {
  for (const material of materialCache.values()) material.dispose();
  materialCache.clear();
  for (const outline of outlineByMesh.values()) {
    outline.geometry.dispose();
    (outline.material as THREE.Material).dispose();
  }
  outlineByMesh.clear();
}
