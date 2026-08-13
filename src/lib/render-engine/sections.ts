import * as THREE from "three/webgpu";
import type { Section } from "@/lib/types";

/** Pure geometry/math for the Sections module — deliberately side-effect
 * free (no scene mutation, no THREE.Object3D added anywhere) so it's
 * testable standalone (see scripts/test-sections.mjs) and so
 * `RenderEngine.ts` stays the only place that actually touches the live
 * scene, same separation `viewerPresets.ts`/`glbUnitNodes.ts` already
 * have from `RenderEngine.ts`.
 *
 * A Section's clipping volume is 4 vertical side planes (+ 1 horizontal
 * top plane, + an optional 6th bottom plane) combined with THREE's
 * default clipping intersection semantics: a fragment survives only if
 * it's on the "kept" side of *every* plane in `material.clippingPlanes`
 * simultaneously — i.e. the AND of 5-6 half-spaces, which is exactly a
 * finite, rotated rectangular prism. This is also why no separate
 * "scope resolver" is needed to keep a Section's clip inside one
 * building: the volume is already spatially finite, so a rectangle drawn
 * over Building A never touches Building B's geometry regardless of
 * which materials the planes are assigned to (see `Section`'s own doc
 * comment in src/lib/types.ts). */

const UP = new THREE.Vector3(0, 1, 0);
const MIN_FOOTPRINT_M = 1;
/** `bottomEnabled` clips at world Y=0 (ground) rather than a second
 * stored height — real, but deliberately simple: keeps the data model to
 * exactly the fields the authoring UI exposes (no hidden numeric field
 * with no control). */
const BOTTOM_CLIP_Y = 0;

/** World-space right/forward unit vectors for a section's footprint
 * rotation — local +X/+Z rotated by `rotationDeg` around the vertical
 * axis, matching how `Object3D.rotation.y` already orients everything
 * else in this scene. */
function sectionAxes(rotationDeg: number): { right: THREE.Vector3; forward: THREE.Vector3 } {
  const rad = THREE.MathUtils.degToRad(rotationDeg);
  return {
    right: new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, rad),
    forward: new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, rad),
  };
}

/** Builds the real world-space `THREE.Plane`s for a section's clipping
 * volume — assign the returned array directly to a material's
 * `clippingPlanes` (with `renderer.localClippingEnabled = true`). Order:
 * right, left, front, back, top, [bottom if `bottomEnabled`]. */
export function buildSectionPlanes(section: Section): THREE.Plane[] {
  const { right, left, front, back } = sideAnchors(section);
  const { right: rightAxis, forward: forwardAxis } = sectionAxes(section.rotationDeg);
  const center = new THREE.Vector3(section.centerX, section.heightM, section.centerZ);

  const planes = [
    new THREE.Plane().setFromNormalAndCoplanarPoint(rightAxis.clone().negate(), right),
    new THREE.Plane().setFromNormalAndCoplanarPoint(rightAxis.clone(), left),
    new THREE.Plane().setFromNormalAndCoplanarPoint(forwardAxis.clone().negate(), front),
    new THREE.Plane().setFromNormalAndCoplanarPoint(forwardAxis.clone(), back),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, -1, 0), center),
  ];
  if (section.bottomEnabled) {
    planes.push(
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(section.centerX, BOTTOM_CLIP_Y, section.centerZ)
      )
    );
  }
  return planes;
}

/** The 4 side-boundary world points (right/left/front/back edge
 * midpoints), factored out since both `buildSectionPlanes` and the
 * authoring wireframe preview need them. */
function sideAnchors(section: Section) {
  const { right: rightAxis, forward: forwardAxis } = sectionAxes(section.rotationDeg);
  const center = new THREE.Vector3(section.centerX, section.heightM, section.centerZ);
  const hw = section.widthM / 2;
  const hd = section.depthM / 2;
  return {
    right: center.clone().addScaledVector(rightAxis, hw),
    left: center.clone().addScaledVector(rightAxis, -hw),
    front: center.clone().addScaledVector(forwardAxis, hd),
    back: center.clone().addScaledVector(forwardAxis, -hd),
  };
}

/** A flat cap sized to the section's rectangular footprint, pre-
 * positioned/rotated at the cut height via a baked-in transform (so
 * callers just add a Mesh with this geometry at the scene origin, no
 * separate `mesh.position`/`mesh.rotation` bookkeeping to keep in sync).
 * Real, not stencil-silhouette-perfect — see `Section`'s deferred-scope
 * note; correct for the rectangular footprints this authoring tool
 * produces. */
export function buildSectionCapGeometry(section: Section): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(section.widthM, section.depthM);
  // PlaneGeometry starts flat in XY, facing +Z — rotate -90° around X so
  // it lies flat in XZ facing +Y (up), then match the footprint's own
  // rotation/position.
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(THREE.MathUtils.degToRad(section.rotationDeg));
  geometry.translate(section.centerX, section.heightM, section.centerZ);
  return geometry;
}

/** Converts two world-space click points (the draw tool's raycast hits)
 * into a new, axis-aligned `Section` — rotation starts at 0deg, the
 * admin rotates afterward via the gizmo. Clamped to a sane minimum
 * footprint so a near-zero drag doesn't produce a degenerate/invisible
 * volume. */
export function sectionFromDragPoints(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  opts: { id: string; name: string; heightM: number; scope: Section["scope"]; buildingName?: string }
): Section {
  const centerX = (p1.x + p2.x) / 2;
  const centerZ = (p1.z + p2.z) / 2;
  const widthM = Math.max(MIN_FOOTPRINT_M, Math.abs(p2.x - p1.x));
  const depthM = Math.max(MIN_FOOTPRINT_M, Math.abs(p2.z - p1.z));
  return {
    id: opts.id,
    name: opts.name,
    scope: opts.scope,
    buildingName: opts.buildingName,
    centerX,
    centerZ,
    widthM,
    depthM,
    rotationDeg: 0,
    heightM: opts.heightM,
    bottomEnabled: false,
    fillGapsEnabled: false,
    fillColor: DEFAULT_FILL_COLOR,
  };
}

/** Default `fillColor` for a freshly-drawn section — a neutral
 * architectural white/gray, real and editable the moment "Fill Gaps" is
 * switched on, not a placeholder. */
export const DEFAULT_FILL_COLOR = "#f2f2f2";

/** The clip-plane indicator's fixed color (`fillGapsEnabled: false`
 * case) — brand purple, matching the draw-preview rectangle and gizmo
 * accents elsewhere in the Sections module, so it unambiguously reads as
 * "editing chrome," never as a real material. */
export const SECTION_INDICATOR_COLOR = "#6b55f5";
