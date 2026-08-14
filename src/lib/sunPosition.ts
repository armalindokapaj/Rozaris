/**
 * Sun position math — direction vector + color-temperature approximation
 * for a real sun given elevation/azimuth (Sky/Water/Bloom/Clouds "Ocean"
 * tab). The old geographic solar-position calculator (NOAA-style
 * elevation/azimuth from lat/lng/date/time, plus a sunrise/sunset
 * calculator) was removed entirely 2026-08-14 along with the geographic
 * sun system it fed — see Project3DConfig's own doc comment in
 * src/lib/types.ts. `SunPosition` (elevation/azimuth/isNight) is now
 * always authored directly, matching webgl_shaders_ocean.html's own GUI.
 */

export interface SunPosition {
  /** Degrees above the horizon; negative once the sun is below it. */
  elevationDeg: number;
  /** Degrees clockwise from the scene's "north" (0 = north, 90 = east). */
  azimuthDeg: number;
  /** True once elevationDeg <= 0 — sun is below the horizon. */
  isNight: boolean;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Converts elevation/azimuth into a unit direction vector in Three.js's
 * Y-up space (X=east, Y=up, Z=south) — scaled by the caller for a
 * DirectionalLight's `.position` (a directional light's position only
 * encodes direction toward the target, not a real distance). */
export function sunDirectionVector(pos: SunPosition): { x: number; y: number; z: number } {
  const elevRad = toRad(pos.elevationDeg);
  const azRad = toRad(pos.azimuthDeg);
  return {
    x: Math.cos(elevRad) * Math.sin(azRad),
    y: Math.sin(elevRad),
    z: Math.cos(elevRad) * Math.cos(azRad),
  };
}

/** Warm-to-white-to-cool color temperature approximation driven by solar
 * elevation — low sun reads warm (sunrise/sunset), high sun reads neutral
 * white, matching real-world color temperature shift without a full
 * blackbody-radiation model. */
export function sunColorForElevation(elevationDeg: number): number {
  const t = Math.max(0, Math.min(1, elevationDeg / 35)); // 0 at/under horizon, 1 by 35°
  const warm = { r: 0xff, g: 0xa1, b: 0x5c };
  const white = { r: 0xff, g: 0xff, b: 0xff };
  const r = Math.round(warm.r + (white.r - warm.r) * t);
  const g = Math.round(warm.g + (white.g - warm.g) * t);
  const b = Math.round(warm.b + (white.b - warm.b) * t);
  return (r << 16) | (g << 8) | b;
}

/** Public-viewer "Sun Orientation" slider (2026-08-14, 2nd pass — "move
 * the time from 6am to 8pm with a slider") — NOT a revival of the
 * removed geographic calculator this file's own doc comment describes;
 * a simple, self-contained east-to-west arc with no lat/lng/date
 * dependency at all. Elevation follows a sine curve that's exactly 0 at
 * both `minHour`/`maxHour` (sun right at the horizon at each edge, real
 * sunrise/sunset framing for a 6am-8pm range) and peaks at the
 * midpoint; azimuth sweeps linearly from roughly east to roughly west
 * across the same span. `hour` is clamped into range first, so a caller
 * can pass a slightly-out-of-range value safely. */
const SUN_ARC_MAX_ELEVATION_DEG = 65;
const SUN_ARC_AZIMUTH_START_DEG = 85; // roughly east
const SUN_ARC_AZIMUTH_END_DEG = 275; // roughly west

export function sunPositionForHour(
  hour: number,
  minHour: number,
  maxHour: number
): { elevationDeg: number; azimuthDeg: number } {
  const clampedHour = Math.min(maxHour, Math.max(minHour, hour));
  const t = (clampedHour - minHour) / (maxHour - minHour);
  return {
    elevationDeg: SUN_ARC_MAX_ELEVATION_DEG * Math.sin(Math.PI * t),
    azimuthDeg: SUN_ARC_AZIMUTH_START_DEG + (SUN_ARC_AZIMUTH_END_DEG - SUN_ARC_AZIMUTH_START_DEG) * t,
  };
}
