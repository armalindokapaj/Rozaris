import mapboxgl from "mapbox-gl";

/**
 * "Mapbox merged into the Studio Scene" (see the approved plan, Phase 1) —
 * pure math bridge from Studio's existing free-orbit camera (local Y-up
 * meters, arbitrary origin) to an equivalent Mapbox `center/zoom/pitch/
 * bearing`. This is the ONE-WAY half of the design: Studio's OrbitControls
 * camera stays the sole source of truth for navigation (Shots, Idle Drone
 * Camera, unit click-to-focus, DOF auto-focus all keep reading/writing
 * `camera`/`controls` exactly as they do today, completely unaware this
 * exists) — this module only computes what to hand Mapbox so its own
 * basemap/terrain draws the matching real-world view underneath.
 *
 * Deliberately framework-light (plain `{x,y,z}` objects, no `THREE.Vector3`
 * dependency) so it's usable/testable in isolation, per the plan's own
 * note that this is genuinely new math (no prior local-camera→Mapbox-camera
 * derivation exists anywhere in this codebase — `ProjectModelLayer.
 * applyTransform()` solves the adjacent-but-different problem of placing a
 * MODEL's matrix in Mercator space, not a camera) and will need visual
 * tuning once wired into the live engine (Phase 3), not treated as exact.
 *
 * Local coordinate convention this module assumes (must match how
 * RenderEngine's scene content is authored): Y-up, meters, local +X = east
 * and local -Z = north when `anchor.headingDeg` is 0 — i.e. an unrotated
 * scene's "into the screen" direction (three.js's default camera-forward,
 * -Z) reads as true north. `anchor.headingDeg` corrects for a scene that
 * wasn't authored aligned to true north, exactly the same purpose the
 * (separate, untouched) Map tab's own `mapViewHeadingDeg` serves for a
 * single placed model.
 */

export interface BasemapAnchor {
  /** Real-world coordinates that local (0, 0, 0) maps to — this build's
   * default is the project's own `lat`/`lng` (see the plan's Phase 5),
   * independent of the untouched Map tab's own draggable-pin override. */
  latitude: number;
  longitude: number;
  /** Degrees clockwise the local "north" axis (local -Z) is rotated away
   * from true north. Same convention/sign as Mapbox's own `bearing`. */
  headingDeg: number;
  /** Real-world meters per local scene unit. 1 for an already-metric GLB
   * (the normal case) — kept as a field, not a hardcoded 1, purely for
   * parity with the Map tab's own `mapViewScale`, in case a future project
   * is ever authored at a non-1:1 scale. */
  scale: number;
}

export interface LocalCameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  /** Vertical field of view, degrees — `THREE.PerspectiveCamera.fov`. */
  fovDeg: number;
  viewportHeightPx: number;
}

export interface MapboxCameraState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Standard Web Mercator ground-resolution constant (meters/pixel at
 * zoom 0, equator) — the same constant behind Mapbox/Google/OSM's shared
 * tiling scheme: metersPerPixel(zoom, lat) = this * cos(lat) / 2^zoom. */
const GROUND_RESOLUTION_AT_ZOOM_0 = 156543.03392;

const MIN_ZOOM = 0;
const MAX_ZOOM = 22; // matches the Map tab's own mapViewZoom slider bounds
const DEFAULT_MAX_PITCH_DEG = 80; // headroom under Mapbox's hard 85° cap

/** Below this camera-to-target distance the derivation below (which
 * divides by it) stops being meaningful — holds the previous frame's
 * apparent scale rather than blowing up into an extreme zoom. */
const MIN_FOCUS_DISTANCE_M = 0.5;

/**
 * Converts a local horizontal (east, north) offset from the anchor, in
 * real-world meters, into the resulting lng/lat — via `MercatorCoordinate`,
 * the same technique `ProjectModelLayer.applyTransform()` already uses for
 * placing a model, applied here to a camera-space point instead.
 */
function offsetLngLat(anchor: BasemapAnchor, eastM: number, northM: number): [number, number] {
  const anchorMercator = mapboxgl.MercatorCoordinate.fromLngLat(
    { lng: anchor.longitude, lat: anchor.latitude },
    0
  );
  const metersToMercator = anchorMercator.meterInMercatorCoordinateUnits();
  const mercator = new mapboxgl.MercatorCoordinate(
    anchorMercator.x + eastM * metersToMercator,
    anchorMercator.y - northM * metersToMercator, // Mercator y increases southward
    anchorMercator.z
  );
  const lngLat = mercator.toLngLat();
  return [lngLat.lng, lngLat.lat];
}

/**
 * Rotates a local (east, north) offset by the anchor's heading so it reads
 * as a TRUE (east, north) offset — standard clockwise compass-bearing
 * rotation, matching Mapbox's own `bearing` sign convention.
 */
function rotateByHeading(localEastM: number, localNorthM: number, headingDeg: number): [number, number] {
  const rad = (headingDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const trueEast = localEastM * cos + localNorthM * sin;
  const trueNorth = -localEastM * sin + localNorthM * cos;
  return [trueEast, trueNorth];
}

/**
 * The Phase 1 derivation itself. Deliberately takes no real-terrain-
 * elevation input: `center`/`zoom`/`pitch`/`bearing` (this function's
 * whole output shape) has no altitude field — the camera→target vector's
 * pitch/bearing/zoom are relative quantities, unaffected by how the
 * anchor's absolute real-world elevation compares to local Y=0. Real
 * terrain height only becomes relevant once Phase 3 wires this into a live
 * Mapbox instance (e.g. to decide whether the derived view clips into real
 * terrain) — deliberately not this pure function's concern.
 */
export function computeMapboxCameraFromLocal(
  local: LocalCameraState,
  anchor: BasemapAnchor,
  opts?: { maxPitchDeg?: number }
): MapboxCameraState {
  const maxPitchDeg = opts?.maxPitchDeg ?? DEFAULT_MAX_PITCH_DEG;

  const dx = (local.target.x - local.position.x) * anchor.scale;
  const dy = (local.target.y - local.position.y) * anchor.scale;
  const dz = (local.target.z - local.position.z) * anchor.scale;
  const horizontalDist = Math.hypot(dx, dz);
  const focusDist = Math.max(MIN_FOCUS_DISTANCE_M, Math.hypot(dx, dy, dz));

  // --- Center: project the TARGET's local offset from the anchor into
  // real lng/lat — Mapbox's `center` is the real-world ground point the
  // camera looks at, so this (not the camera position) is the point that
  // belongs at screen-center. Local convention: east = +X, north = -Z.
  const [localEast, localNorth] = [local.target.x * anchor.scale, -local.target.z * anchor.scale];
  const [trueEast, trueNorth] = rotateByHeading(localEast, localNorth, anchor.headingDeg);
  const center = offsetLngLat(anchor, trueEast, trueNorth);

  // --- Bearing: compass direction (clockwise from true north) of the
  // camera→target look direction's horizontal component, plus the
  // anchor's own heading offset to align the local frame to true north.
  // atan2(east, north) is the standard "compass bearing of a vector"
  // formula; local east/north components of (dx, dz) are (dx, -dz) per
  // this module's stated convention.
  //
  // Known singularity (verified, not a bug): when horizontalDist is ~0
  // (camera looking straight down, dx and dz both ~0), "compass bearing"
  // has no real meaning and this atan2 can land on an arbitrary value —
  // floating-point negative-zero even flips it exactly at dx=dz=0
  // (`Math.atan2(0, -0) === Math.PI`, unlike `atan2(0, 0) === 0`). Mapbox's
  // own bearing is equally meaningless at pitch≈0 for the same reason, so
  // this is harmless as pure math — but Phase 3's live wiring should hold
  // the previous frame's bearing rather than feed Mapbox this noise
  // whenever horizontalDist drops near zero.
  const localBearingDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const bearing = normalizeBearing(localBearingDeg + anchor.headingDeg);

  // --- Pitch: Mapbox's pitch is 0 = looking straight down (nadir), 90 =
  // looking at the horizon. `lookDownDeg` is the camera→target direction's
  // angle below horizontal (90 = straight down, 0 = horizontal) — pitch is
  // its complement. Clamped to Mapbox's own valid range.
  const lookDownDeg = (Math.atan2(-dy, horizontalDist) * 180) / Math.PI;
  const pitch = clamp(90 - lookDownDeg, 0, maxPitchDeg);

  // --- Zoom: solved so Mapbox's ground-resolution (meters/pixel) at the
  // target's latitude matches what Studio's own perspective camera shows
  // at the camera-to-target distance — i.e. "the basemap should read at
  // the same real-world scale Studio's own content does". Purely a
  // starting point for Phase 3's visual tuning (see this file's own doc
  // comment) — foreshortening differs between Mapbox's tile projection and
  // a true perspective camera, especially at high pitch.
  const fovRad = (local.fovDeg * Math.PI) / 180;
  const visibleWorldHeightM = 2 * focusDist * Math.tan(fovRad / 2);
  const metersPerPixel = visibleWorldHeightM / Math.max(1, local.viewportHeightPx);
  const latRad = (center[1] * Math.PI) / 180;
  const zoomRaw = Math.log2((GROUND_RESOLUTION_AT_ZOOM_0 * Math.cos(latRad)) / Math.max(1e-6, metersPerPixel));
  const zoom = clamp(zoomRaw, MIN_ZOOM, MAX_ZOOM);

  return { center, zoom, pitch, bearing };
}

function normalizeBearing(deg: number): number {
  let b = deg % 360;
  if (b > 180) b -= 360;
  if (b < -180) b += 360;
  return b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
