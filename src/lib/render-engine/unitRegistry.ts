import * as THREE from "three/webgpu";
// Fat-line (screen-space width) outline. `THREE.LineBasicMaterial`'s own
// `linewidth` is a documented no-op on every WebGL/WebGPU backend — it
// always draws a 1px hairline — so an admin-controllable outline width
// has to go through the instanced-quad line addon. The `lines/webgpu/`
// variant is the one built on `Line2NodeMaterial`, which is what this
// app's WebGPURenderer pipeline needs (the plain `lines/LineSegments2`
// is the WebGL-only `LineMaterial` build). It derives its pixel-width
// scaling from the built-in viewport node, so unlike the WebGL variant
// there is no `material.resolution` to keep in sync on resize.
import { LineSegments2 } from "three/examples/jsm/lines/webgpu/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { Unit, UnitMeshLink, UnitsConfig } from "@/lib/types";
import { unitSelectedFillColorNumber, unitSelectedOutlineColorNumber, unitStatusColorNumber } from "@/lib/unitStatusVisuals";
import { cleanGlbNodeName } from "@/lib/glbNodeName";
import { clipSegmentsToPlanes, planesSignature } from "./sections";

const UNIT_NODE_PATTERN = /^Unit_/i;

/** A fat-line material with three.js' own clipping switched OFF, because
 * for a fat line three's clipping is not merely imprecise — it is
 * evaluated at the wrong point entirely, and its verdict is all-or-nothing
 * for the whole outline.
 *
 * `ClippingNode` (hardware clip-distances and the fragment-discard
 * fallback alike) tests `positionView` = `modelViewMatrix * position`. For
 * `LineSegments2` the `position` attribute is only a unit-quad template —
 * the real endpoints live in `instanceStart`/`instanceEnd` — so the test
 * effectively runs on the outline's own ORIGIN. Both failure modes were
 * reproduced in a real browser on tower-vlora: with the origin inside the
 * section volume the whole outline survives a cut untouched (the reported
 * "section does not cut the selected unit"), and with it outside — unit
 * A-002's mesh origin sits at y=57.14, a Floor 7 cut at y=57.1 — the
 * entire outline vanishes instead, including the two-thirds of it that is
 * below the cut.
 *
 * So the GPU is taken out of the decision completely and
 * `clipUnitOutlinesToSection` does the cut on the CPU, exactly. Both
 * overrides put the builder in the same state it would be in with no
 * clipping context at all, which is a state three already handles on every
 * frame — this is not a shortcut around clipping, it is the whole
 * mechanism moved somewhere it can be correct.
 *
 * ⚠️ If a three.js upgrade ever renames these two NodeMaterial hooks, the
 * override silently stops applying and the symptom returns — the outline
 * either survives cuts whole or disappears at them. Check here first. */
class UnclippedLine2NodeMaterial extends THREE.Line2NodeMaterial {
  setupClipping(): ReturnType<THREE.Line2NodeMaterial["setupClipping"]> {
    // three's own "no clipping context" return value; typed non-null
    // upstream, actually nullable in the implementation.
    return null as unknown as ReturnType<THREE.Line2NodeMaterial["setupClipping"]>;
  }

  setupHardwareClipping(builder: Parameters<THREE.Line2NodeMaterial["setupHardwareClipping"]>[0]): void {
    // Exactly what three's own implementation does before it decides
    // whether clip-distances apply — it just never gets to say yes.
    (builder as unknown as { hardwareClipping: boolean }).hardwareClipping = false;
  }
}

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
  /** Resolved yaw the POI camera actually uses — either the admin's own
   * authored value or, when they never set one, a direction derived from
   * the building's geometry. See `poiYawAuthored`. */
  poiYawDeg: number;
  /** Whether a human actually chose `poiYawDeg` (the Units tab's own
   * N/E/S/W "Camera from" buttons) rather than it being derived. Kept
   * separate because `0` is a legitimate authored value — it is due
   * North — so the number alone cannot answer this. */
  poiYawAuthored: boolean;
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
  // The selection outline is parented to the mesh it traces, and
  // LineSegments2 extends Mesh — so a plain `.isMesh` traversal picks the
  // outline itself back up as if it were part of the unit's own volume:
  // it gets handed the translucent unit-box material (destroying the
  // fat-line material, which is why it stops responding to width changes)
  // and then gains an outline of its own, one level deeper on every
  // subsequent pass. The pre-fat-line THREE.LineSegments never hit this —
  // it isn't a Mesh — so outlines are tagged on creation and skipped
  // here, subtree and all.
  function walk(current: THREE.Object3D) {
    if (current.userData.isUnitOutline) return;
    if ((current as THREE.Mesh).isMesh) meshes.push(current as THREE.Mesh);
    for (const child of current.children) walk(child);
  }
  walk(node);
  return meshes;
}

/** Camera yaw for a unit nobody has aimed: the compass direction pointing
 * from the building's centre OUT through the unit, so the camera ends up
 * outside the mass looking back in.
 *
 * The alternative — and what shipped until now — is a flat `0`, i.e. due
 * North for every unit on every face of every building. That is not a
 * neutral default, it is an arbitrary one, and combined with
 * `focusUnit()`'s own `distance = boundingRadius * unitPoiCameraDistanceMultiplier`
 * it reliably put the camera INSIDE the building for any unit not on the
 * north face. Verified on tower-vlora, whose three units all sit on
 * defaults: "Test Camera" framed the back of a floor slab from inside the
 * tower.
 *
 * `atan2(x, z)`, not the usual `atan2(y, x)`, because `focusUnit` builds
 * its offset as `(sin(yaw) * d, height, cos(yaw) * d)` — yaw is measured
 * from +Z toward +X, so this has to match that convention exactly.
 *
 * A unit sitting essentially on the centre axis (a core, a lift shaft) has
 * no meaningful outward direction; those fall back to 0 rather than
 * amplifying floating-point noise into a random heading.
 */
function derivedYawDeg(worldCenter: THREE.Vector3, sceneCenter: THREE.Vector3 | null): number {
  if (!sceneCenter) return 0;
  const dx = worldCenter.x - sceneCenter.x;
  const dz = worldCenter.z - sceneCenter.z;
  if (dx * dx + dz * dz < 1e-6) return 0;
  return (Math.atan2(dx, dz) * 180) / Math.PI;
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
  poiByUnitId: Map<
    string,
    { poiYawDeg: number | null; poiEnabled: boolean; poiDistanceOverride: number | null; poiHeightOverride: number | null }
  >,
  /** Centre of everything currently loaded, used to derive a camera yaw
   * for units nobody has aimed — see `derivedYawDeg`. Null when nothing is
   * loaded yet, in which case unaimed units fall back to 0. */
  sceneCenter: THREE.Vector3 | null = null
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
    // `0` counts as UNAIMED, not as "aimed due North". That looks like a
    // heuristic and is really a property of the data model: `poiYawDeg` is
    // a non-nullable `Float @default(0)` (schema.prisma, UnitMeshLinkV2),
    // the links API writes `link.poiYawDeg ?? 0` on every save, and the
    // Units tab highlights its own "N" preset whenever the value is 0 — so
    // there is no representation of "unset" anywhere in the stack, and
    // every link in the database sits at 0 without a human ever having
    // chosen it. Treating 0 as an aim would mean deriving nothing, ever.
    //
    // The cost is that an admin cannot currently express a deliberate due-
    // North aim; they get the derived outward direction instead. That is a
    // near-invisible loss and often an improvement — a unit on the south
    // face aimed "North" puts the camera on the far side looking back
    // through the building, which is not what anyone picking a compass
    // point means. Making the column nullable is the real fix if an
    // explicit North ever matters; 90/180/270 are unambiguous today.
    const authoredYaw = poi?.poiYawDeg ?? null;
    const yawAimed = authoredYaw != null && authoredYaw !== 0;
    registry.set(unit.id, {
      unitId: unit.id,
      unitCode: unit.code,
      status: unit.status,
      rootObject,
      meshes: collectMeshes(rootObject),
      worldBounds,
      worldCenter,
      worldBoundingSphere,
      poiYawDeg: yawAimed ? authoredYaw : derivedYawDeg(worldCenter, sceneCenter),
      poiYawAuthored: yawAimed,
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
  | "unitBlocksSelectedOutlineWidth"
  | "unitBlocksSelectedScaleEnabled"
  | "unitBlocksSelectedScale"
  | "unitBlocksSelectedFillEnabled"
  | "unitColorSelectedFill"
  | "unitBlocksSelectedXrayEnabled"
  | "unitColorAvailable"
  | "unitColorReserved"
  | "unitColorSold"
  | "unitColorSelected"
>;

function materialCacheKey(color: number, opacity: number, depthTest: boolean): string {
  return `${color}|${opacity}|${depthTest}`;
}

/** Clamped to the same 0.5-20px range the config PATCH route validates,
 * so a hand-written API payload (or a row predating this field) can't
 * produce a zero-width/invisible or absurdly wide outline. */
function outlineWidthPx(config: Pick<UnitBoxAppearanceConfig, "unitBlocksSelectedOutlineWidth">): number {
  const width = config.unitBlocksSelectedOutlineWidth;
  if (!Number.isFinite(width)) return 1;
  return Math.min(20, Math.max(0.5, width));
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
  outlineByMesh: Map<THREE.Mesh, LineSegments2>
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

      // §12's default is that selection does NOT repaint the block — a
      // sold unit stays red while selected, and only the outline marks it.
      // `unitBlocksSelectedFillEnabled` is the per-project opt-out of that
      // rule, for projects where the outline alone doesn't read.
      const color =
        isSelected && config.unitBlocksSelectedFillEnabled
          ? unitSelectedFillColorNumber(config)
          : unitStatusColorNumber(unit!.status, config);
      const opacity = isSelected
        ? config.unitBlocksSelectedOpacity
        : isHovered
          ? config.unitBlocksHoverOpacity
          : config.unitBlocksDefaultOpacity;
      // X-ray = draw the block through whatever is in front of it, i.e.
      // depth testing off. Project-wide via `unitBlocksXrayEnabled`, or
      // for the selected unit alone via `unitBlocksSelectedXrayEnabled`
      // — so a click can make one unit readable from any orbit angle
      // without turning the whole facade into a glass box. The outline
      // below reuses this same value, otherwise a see-through block
      // would keep an occluded outline.
      const depthTest = !(config.unitBlocksXrayEnabled || (isSelected && config.unitBlocksSelectedXrayEnabled));
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
      // edge outline instead of replacing the fill outright. The outline
      // is a fat line whose width is a real per-project setting
      // (`unitBlocksSelectedOutlineWidth`, in screen pixels), so a
      // selected unit stays legible at masterplan distance instead of
      // thinning to the 1px hairline a plain LineSegments is stuck at.
      if (isSelected && config.unitBlocksSelectedOutlineEnabled) {
        let outline = outlineByMesh.get(mesh);
        const outlineColor = unitSelectedOutlineColorNumber(config);
        const linewidth = outlineWidthPx(config);
        if (!outline) {
          // EdgesGeometry is only the source of the segment endpoints —
          // LineSegmentsGeometry copies them into its own instanced
          // attributes, so the intermediate is disposed immediately
          // rather than kept alive by the outline.
          const edges = new THREE.EdgesGeometry(mesh.geometry);
          const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
          // Kept so `clipUnitOutlinesToSection` below can re-derive the
          // outline from the FULL edge set every time the active section
          // moves, instead of progressively clipping an already-clipped
          // one (which could only ever shrink).
          const basePositions = Array.from(edges.attributes.position.array as ArrayLike<number>);
          edges.dispose();
          const material = new UnclippedLine2NodeMaterial({ color: outlineColor });
          material.linewidth = linewidth;
          material.depthTest = depthTest;
          // The fat-line quads are camera-facing strips, not the mesh's
          // own triangles — without this they z-fight with the very
          // surface whose edge they trace.
          material.polygonOffset = true;
          material.polygonOffsetFactor = -2;
          material.polygonOffsetUnits = -2;
          outline = new LineSegments2(geometry, material);
          // See collectMeshes — this tag is what keeps the outline out of
          // its own parent unit's mesh list.
          outline.userData.isUnitOutline = true;
          outline.userData.basePositions = basePositions;
          // Unit boxes are transparent overlays drawn after the opaque
          // scene; the outline has to follow its own mesh rather than be
          // sorted independently by distance.
          outline.renderOrder = mesh.renderOrder + 1;
          mesh.add(outline);
          outlineByMesh.set(mesh, outline);
        } else {
          outline.material.color.setHex(outlineColor);
          outline.material.linewidth = linewidth;
          outline.material.depthTest = depthTest;
        }
      } else {
        clearOutline(mesh);
      }
    }
  }

  return raycastTargets;
}

/** Sections + fat lines: re-derives every live selection outline from its
 * full edge set, clipped on the CPU to the active section's volume.
 *
 * The GPU cannot do this one (see `clipSegmentsToPlanes`' own doc comment
 * for the three.js mechanics and the browser-reproduced symptom): a
 * `LineSegments2` inside a ClippingGroup is clipped as if it sat at its
 * object's origin, so a selected unit standing above a Floor section kept
 * a whole purple box floating over the cut while the block it traces was
 * correctly sliced.
 *
 * Runs after `applyUnitSelectionScale`, deliberately — the "pop" moves the
 * unit root, and clipping has to be measured against where the outline
 * actually ends up, not where it was before the pop. `planes` is null when
 * nothing should be clipped at all; `NO_ACTIVE_SECTION_PLANES` also works
 * and is a no-op by construction, but null skips the work entirely.
 *
 * Cheap enough for a slider drag: only the selected unit has outlines at
 * all, each a box's worth of edges, and a signature guard skips frames
 * where the section hasn't actually moved. */
export function clipUnitOutlinesToSection(
  outlineByMesh: Map<THREE.Mesh, LineSegments2>,
  planes: THREE.Plane[] | null
) {
  const sectionSignature = planes ? planesSignature(planes) : "none";
  const worldPoint = new THREE.Vector3();
  for (const [mesh, outline] of outlineByMesh) {
    const base = outline.userData.basePositions as number[] | undefined;
    if (!base) continue;
    // The unit's own world transform is part of the signature, not just the
    // section's: a Building-transform drag or the selection "pop" moves the
    // outline through a stationary cut plane, and a section-only signature
    // would happily leave it clipped where it used to be.
    mesh.updateWorldMatrix(true, false);
    const signature = `${sectionSignature}#${mesh.matrixWorld.elements.join(",")}`;
    if (outline.userData.clipSignature === signature) continue;
    outline.userData.clipSignature = signature;

    if (!planes) {
      // setPositions recomputes the geometry's own bounds for us.
      outline.geometry.setPositions(base);
      outline.visible = true;
      continue;
    }

    // The outline is parented to the mesh it traces, so its geometry is in
    // that mesh's local space while the section's planes are world-space:
    // out to world for the clip, back to local for the buffer.
    const toWorld = mesh.matrixWorld;
    const toLocal = toWorld.clone().invert();
    const world: number[] = new Array(base.length);
    for (let i = 0; i + 2 < base.length; i += 3) {
      worldPoint.set(base[i], base[i + 1], base[i + 2]).applyMatrix4(toWorld);
      world[i] = worldPoint.x;
      world[i + 1] = worldPoint.y;
      world[i + 2] = worldPoint.z;
    }
    const clipped = clipSegmentsToPlanes(world, planes);
    if (clipped.length === 0) {
      // Entirely outside the cut — an empty instanced buffer is not worth
      // handing to the GPU, and hiding is exactly the right result.
      outline.visible = false;
      continue;
    }
    for (let i = 0; i + 2 < clipped.length; i += 3) {
      worldPoint.set(clipped[i], clipped[i + 1], clipped[i + 2]).applyMatrix4(toLocal);
      clipped[i] = worldPoint.x;
      clipped[i + 1] = worldPoint.y;
      clipped[i + 2] = worldPoint.z;
    }
    outline.geometry.setPositions(clipped);
    outline.visible = true;
  }
}

/** The original local `position`/`scale` of every unit root currently
 * scaled up by `applyUnitSelectionScale`. Owned by RenderEngine and
 * passed in, same as `originalMaterials`/`outlineByMesh` above — a plain
 * Map rather than a WeakMap because it is fully cleared on every
 * appearance refresh, so it never outlives one selection. */
export type UnitSelectionScaleOriginals = Map<
  THREE.Object3D,
  { position: THREE.Vector3; scale: THREE.Vector3 }
>;

/** Restores every unit root that `applyUnitSelectionScale` last scaled
 * back to its authored transform. Always called BEFORE the appearance /
 * registry pass so `buildUnitRegistry` measures real, un-popped bounds —
 * otherwise the POI camera would frame the selected unit 5% too loosely
 * and the inflation would compound across selections. */
export function clearUnitSelectionScale(originals: UnitSelectionScaleOriginals) {
  for (const [object, transform] of originals) {
    object.position.copy(transform.position);
    object.scale.copy(transform.scale);
    object.updateMatrix();
  }
  originals.clear();
}

/** Selection "pop" (direct request, 2026-08-24: "ability to add a x1.05
 * enlargement of the unit selected to make it more obvious what is
 * clicked"). Scales the selected unit's whole root — mesh or Group of
 * meshes, outline children included, since they're parented to the
 * meshes they trace — about its own bounding-box CENTER.
 *
 * Scaling about the center is the whole difficulty: `object.scale` scales
 * about the object's local origin, and a GLB exported with baked world
 * transforms typically puts that origin at the scene origin, hundreds of
 * metres away — a naive `scale.multiplyScalar(1.05)` would launch the
 * block across the masterplan instead of enlarging it in place. So the
 * position is compensated in the parent's space: a point p scales about
 * `position`, giving center' = position + s·(center − position); solving
 * center' = center for the new position yields
 * position' = position + (1 − s)·(center − position), i.e. the `lerp`
 * below (t is negative for s > 1 — the origin moves away from the
 * center, which is exactly what holds the center still). Uniform scale
 * commutes with the object's rotation, so this stays correct for rotated
 * units too. */
export function applyUnitSelectionScale(
  rootObject: THREE.Object3D,
  scale: number,
  originals: UnitSelectionScaleOriginals
) {
  if (!Number.isFinite(scale)) return;
  const clamped = Math.min(1.5, Math.max(1, scale));
  if (clamped === 1) return; // nothing to do — keep the authored transform untouched
  if (originals.has(rootObject)) return; // already popped this refresh

  rootObject.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(rootObject);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  if (rootObject.parent) rootObject.parent.worldToLocal(center);

  originals.set(rootObject, { position: rootObject.position.clone(), scale: rootObject.scale.clone() });
  rootObject.scale.multiplyScalar(clamped);
  rootObject.position.lerp(center, 1 - clamped);
  rootObject.updateMatrix();
}

/** Disposes every cached unit-box material/outline — called from
 * RenderEngine.dispose() alongside its other cache teardown. */
export function disposeUnitBoxAppearanceCaches(
  materialCache: Map<string, THREE.MeshBasicMaterial>,
  outlineByMesh: Map<THREE.Mesh, LineSegments2>
) {
  for (const material of materialCache.values()) material.dispose();
  materialCache.clear();
  for (const outline of outlineByMesh.values()) {
    outline.geometry.dispose();
    (outline.material as THREE.Material).dispose();
  }
  outlineByMesh.clear();
}
