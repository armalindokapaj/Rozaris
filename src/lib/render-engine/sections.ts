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
/** Real bug fix (2026-08-14, "resize doesn't save") — the single source
 * of truth for `widthM`/`depthM`'s upper bound, shared by
 * `RenderEngine.ts`'s Resize-gizmo clamp (`onSectionGizmoChange`) so a
 * drag can't produce a value the server will then reject. The API route's
 * own zod schema (`app/api/project-3d-config/[projectId]/route.ts`)
 * duplicates this same number rather than importing it (a route.ts file
 * importing from the render engine would be an odd, one-off dependency
 * direction) — kept in sync by comment, same informal-sync pattern
 * `rotationDeg`'s client-side wrap vs. its own server-side
 * `min(-360).max(360)` already established. */
export const SECTION_MAX_DIMENSION_M = 5000;
/** `bottomEnabled` clips at world Y=0 (ground) rather than a second
 * stored height — real, but deliberately simple: keeps the data model to
 * exactly the fields the authoring UI exposes (no hidden numeric field
 * with no control). */
const BOTTOM_CLIP_Y = 0;
/** Far enough that no real project geometry ever reaches it (every other
 * distance in this app — camera far plane, sky dome radius, water plane
 * size — tops out in the thousands; see WATER_PLANE_SIZE/SKY_DOME_SCALE
 * in viewerPresets.ts for the actual ceiling) — used to build a "no-op"
 * plane, see `buildSectionPlanes`'s own doc comment for why one always
 * has to exist. */
const FAR_M = 1_000_000;

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
 * `clippingPlanes` (with `renderer.localClippingEnabled = true`). Fixed
 * order, fixed length (always exactly 6): right, left, front, back, top,
 * bottom — `bottomEnabled: false` gets a real `THREE.Plane` too, just one
 * pushed out to `noClipPlane()`'s distance so it never actually clips
 * anything, rather than the array simply being 5 long.
 *
 * Real click-freeze bug fix (2026-08-14, reported as "Clipping doesn't
 * work"): this array's *length* used to vary — 5 planes normally, 6 with
 * `bottomEnabled`, 0 for "no section active" (`RenderEngine.
 * applyActiveClipping` passing `[]`). Verified against three.js's own
 * installed WebGPU node source (`nodes/accessors/ClippingNode.js`): the
 * clipping loop is unrolled at *shader-setup* time keyed off
 * `intersectionPlanes.length` (`Loop(numIntersectionPlanes, ...)`), so a
 * changed plane *count* is a genuinely different generated shader, not
 * just a changed uniform value — every activation that changed the count
 * (most of them: off has 0, on has 5-6) forced a real pipeline
 * recompilation across every clipped mesh. Reproduced with a real
 * Playwright long-task measurement: ~12 SECONDS of main-thread block on
 * every such transition, not just the first one (a stale/instance-scoped
 * pipeline cache means even reactivating the exact same section a second
 * time paid it again). Keeping the length fixed at 6 always means the
 * generated shader is byte-identical across every on/off/switch-section
 * action from here on — same uniform values changing, not a shader
 * rebuild — so this should now compile once (ideally pre-warmed at mount,
 * see RenderEngine.ts's own mount()-time warm-up) and never again. */
export function buildSectionPlanes(section: Section): THREE.Plane[] {
  const { right, left, front, back } = sideAnchors(section);
  const { right: rightAxis, forward: forwardAxis } = sectionAxes(section.rotationDeg);
  const center = new THREE.Vector3(section.centerX, section.heightM, section.centerZ);
  // `heightOnly` — see Section.heightOnly's own doc comment (types.ts):
  // drop the 4 side planes down to inert no-ops, same technique
  // `noClipPlane()` already uses for a disabled `bottomEnabled`. The array
  // stays 6 long either way (the whole reason `noClipPlane()` exists
  // rather than just shortening the array — see this function's own
  // top-level doc comment above).
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

/** A `THREE.Plane` positioned so nothing in any real scene is ever on its
 * "clip away" side — see `buildSectionPlanes`'s own doc comment for why a
 * real (if inert) plane has to exist here rather than the slot simply
 * being omitted. Deliberately built with the exact same
 * `setFromNormalAndCoplanarPoint(UP, point)` shape the real, already-
 * correct `bottomEnabled` plane above uses (not a hand-derived
 * normal/constant pair) — that pattern is proven to clip away only the
 * region *below* its point and keep everything above; reusing it with the
 * point pushed to `-FAR_M` instead of ground level keeps that same,
 * already-verified direction and just moves the (empty, unreachable)
 * clipped-away region far out of the way, rather than risking a sign
 * error from re-deriving the plane equation by hand. */
function noClipPlane(): THREE.Plane {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(UP, new THREE.Vector3(0, -FAR_M, 0));
}

/** Exactly 6 `noClipPlane()`s — the "no section active" state for
 * anything that assigns straight to a `ClippingGroup.clippingPlanes`
 * (`RenderEngine.applyActiveClipping`). A `[]` there is what used to
 * force a pipeline recompile every time clipping turned back on — see
 * `buildSectionPlanes`'s own doc comment for the full mechanism. Always
 * the same 6 plane VALUES too (not freshly constructed per call) so nothing
 * downstream can mistake this for "changed" input on a render tick where
 * no section is active either before or after. */
export const NO_ACTIVE_SECTION_PLANES: THREE.Plane[] = [
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
  noClipPlane(),
];

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
 * The cap's own *material* is what actually confines a colored fill to
 * real cut geometry (the stencil technique — see RenderEngine.ts's
 * `rebuildSectionCap`); this quad only has to be large enough to *cover*
 * every pixel that stencil test might pass, same as
 * `webgl_clipping_stencil.html`'s own reference cap (a plain flat quad,
 * not silhouette-shaped either — verified against its actual upstream
 * source, not guessed). `heightOnly` (see `Section.heightOnly`'s own doc
 * comment) needs a quad sized to the whole reachable scene rather than
 * this section's own small drawn rectangle, for exactly that reason —
 * `2 * FAR_M` so it's centered on origin. */
export function buildSectionCapGeometry(section: Section): THREE.BufferGeometry {
  const size = section.heightOnly ? 2 * FAR_M : undefined;
  const geometry = new THREE.PlaneGeometry(size ?? section.widthM, size ?? section.depthM);
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
