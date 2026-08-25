import * as THREE from "three/webgpu";
import type { Section } from "@/lib/types";

/** Pure geometry/math for the Sections module — deliberately side-effect
 * free (no scene mutation, no THREE.Object3D added anywhere), same
 * separation viewerPresets.ts/glbUnitNodes.ts have from RenderEngine.ts.
 * Restored near-verbatim from the pre-rebuild engine (2026-08-15,
 * Experience Editor v2) — this is proven-correct pure math with real
 * production bug fixes already baked in (see buildSectionPlanes' own doc
 * comment for the fixed-6-plane-length fix, a real ~12s freeze this exact
 * logic already solved once), not something to re-derive from scratch.
 *
 * A Section's clipping volume is 4 vertical side planes (+ 1 horizontal
 * top plane, + an optional 6th bottom plane) combined with THREE's
 * default clipping intersection semantics: a fragment survives only if
 * it's on the "kept" side of *every* plane in `clippingPlanes`
 * simultaneously — i.e. the AND of 5-6 half-spaces, which is exactly a
 * finite, rotated rectangular prism.
 */

const UP = new THREE.Vector3(0, 1, 0);
const MIN_FOOTPRINT_M = 1;
/** Shared upper bound for widthM/depthM, mirrored by the API route's own
 * zod schema (kept in sync by comment, not import — a route.ts importing
 * from the render engine would be an odd dependency direction). */
export const SECTION_MAX_DIMENSION_M = 5000;

/** Authoring bounds for the Sections panel's own sliders — deliberately
 * far tighter than SECTION_MAX_DIMENSION_M's storage ceiling above. That
 * 5000m bound exists so a mis-drag never silently 400s on save; these are
 * the ranges an admin actually authors within, and a 5000m-wide slider
 * makes every real footprint edit a sub-pixel drag. Values already stored
 * beyond these still load and still save (the API schema, not these, is
 * what validates) — the slider just pins at its end. */
export const SECTION_FOOTPRINT_MAX_M = 200;
/** Piecewise slider scale for a section's cut height: each consecutive
 * pair gets an equal share of the slider's travel, so 0-100m takes the
 * first half and 100-350m the second. */
export const SECTION_HEIGHT_STOPS_M = [0, 100, 350];
/** bottomEnabled clips at world Y=0 (ground) rather than a second stored
 * height — keeps the data model to exactly the fields the authoring UI
 * exposes. */
const BOTTOM_CLIP_Y = 0;
/** Far enough that no real project geometry ever reaches it — used to
 * build a "no-op" plane, see buildSectionPlanes' own doc comment. */
const FAR_M = 1_000_000;

function sectionAxes(rotationDeg: number): { right: THREE.Vector3; forward: THREE.Vector3 } {
  const rad = THREE.MathUtils.degToRad(rotationDeg);
  return {
    right: new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, rad),
    forward: new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, rad),
  };
}

/** Builds the real world-space THREE.Planes for a section's clipping
 * volume. Fixed order, FIXED LENGTH (always exactly 6): right, left,
 * front, back, top, bottom.
 *
 * Real bug fix this logic already carries: the plane array's *length*
 * used to vary (5 normally, 6 with bottomEnabled, 0 for "no section
 * active") — verified against three.js's own WebGPU clipping-node source,
 * the clipping loop is unrolled at shader-SETUP time keyed off plane
 * count, so a changed count is a genuinely different generated shader,
 * not just a changed uniform — every activation that changed the count
 * forced a real pipeline recompile (~12s main-thread block, reproduced
 * with a real Playwright long-task measurement). Keeping the length fixed
 * at 6 always means the generated shader is byte-identical across every
 * on/off/switch-section action — same uniform values changing, not a
 * shader rebuild. */
export function buildSectionPlanes(section: Section): THREE.Plane[] {
  const { right, left, front, back } = sideAnchors(section);
  const { right: rightAxis, forward: forwardAxis } = sectionAxes(section.rotationDeg);
  const center = new THREE.Vector3(section.centerX, section.heightM, section.centerZ);
  const heightOnly = !!section.heightOnly;

  return [
    heightOnly ? noClipPlane() : new THREE.Plane().setFromNormalAndCoplanarPoint(rightAxis.clone().negate(), right),
    heightOnly ? noClipPlane() : new THREE.Plane().setFromNormalAndCoplanarPoint(rightAxis.clone(), left),
    heightOnly ? noClipPlane() : new THREE.Plane().setFromNormalAndCoplanarPoint(forwardAxis.clone().negate(), front),
    heightOnly ? noClipPlane() : new THREE.Plane().setFromNormalAndCoplanarPoint(forwardAxis.clone(), back),
    new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, -1, 0), center),
    section.bottomEnabled
      ? new THREE.Plane().setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(section.centerX, BOTTOM_CLIP_Y, section.centerZ)
        )
      : noClipPlane(),
  ];
}

function noClipPlane(): THREE.Plane {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(UP, new THREE.Vector3(0, -FAR_M, 0));
}

/** Exactly 6 noClipPlane()s — the "no section active" state for anything
 * that assigns straight to a ClippingGroup.clippingPlanes. Always the
 * same 6 plane VALUES (not freshly constructed per call) so nothing
 * downstream mistakes this for "changed" input on a render tick where no
 * section is active either before or after. */
export const NO_ACTIVE_SECTION_PLANES: THREE.Plane[] = [
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
];

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
 * positioned/rotated at the cut height via a baked-in transform. */
export function buildSectionCapGeometry(section: Section): THREE.BufferGeometry {
  const size = section.heightOnly ? 2 * FAR_M : undefined;
  const geometry = new THREE.PlaneGeometry(size ?? section.widthM, size ?? section.depthM);
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(THREE.MathUtils.degToRad(section.rotationDeg));
  geometry.translate(section.centerX, section.heightM, section.centerZ);
  return geometry;
}

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

export const DEFAULT_FILL_COLOR = "#f2f2f2";
export const SECTION_INDICATOR_COLOR = "#6b55f5";
