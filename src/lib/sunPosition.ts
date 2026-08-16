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
  /** True once elevationDeg <= 0 — sun is below the horizon. Optional:
   * Experience Editor v2's Global Sun Vector (PRD §9-10) resolves plain
   * {elevationDeg, azimuthDeg} pairs from several sources (direct/manual-
   * anchors/geographic) that don't compute this themselves — only callers
   * that need it (sun-intensity curves) derive it separately. */
  isNight?: boolean;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Converts elevation/azimuth into a unit direction vector in Three.js's
 * Y-up space (X=east, Y=up, Z=south) — scaled by the caller for a
 * DirectionalLight's `.position` (a directional light's position only
 * encodes direction toward the target, not a real distance). */
export function sunDirectionVector(pos: Pick<SunPosition, "elevationDeg" | "azimuthDeg">): { x: number; y: number; z: number } {
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

/**
 * Experience Editor v2, Environment → Sun & Sky (PRD §9 "ROZARIS Manual
 * Time + Sun System") — a single admin-authored "Solar Anchor" (time of
 * day → elevation/azimuth pair). `Project3DConfig.solarAnchors` stores an
 * array of these; `sunPositionForAnchors` below interpolates between them.
 * Distinct from the old geographic system and from `sunPositionForHour`'s
 * fixed east-west arc — this is admin-authored, per-project, and not tied
 * to any real-world latitude.
 */
export interface SolarAnchor {
  id: string;
  /** 0-24, may repeat outside that range in intermediate math but is
   * always authored/read within it. */
  timeHours: number;
  elevationDeg: number;
  azimuthDeg: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path interpolation between two compass angles — a straight
 * `lerp` would sweep the LONG way around for e.g. 350°→10° (through 180°
 * instead of through 0°/360°), which is never what an admin authoring a
 * sunrise-to-sunset path wants. */
function lerpAngleDeg(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180; // shortest signed delta, -180..180
  return (((a + diff * t) % 360) + 360) % 360;
}

/** Manual Solar Path (PRD §9) — interpolates elevation/azimuth between
 * admin-authored time anchors, wrapping around the 24h clock (an anchor at
 * 22:00 and another at 04:00 interpolate through midnight, not back across
 * the whole rest of the day). Zero anchors falls back to a reasonable
 * midday default; one anchor holds that value at every hour. */
export function sunPositionForAnchors(hour: number, anchors: SolarAnchor[]): { elevationDeg: number; azimuthDeg: number } {
  if (anchors.length === 0) return { elevationDeg: 45, azimuthDeg: 180 };
  const sorted = [...anchors].sort((a, b) => a.timeHours - b.timeHours);
  if (sorted.length === 1) return { elevationDeg: sorted[0].elevationDeg, azimuthDeg: sorted[0].azimuthDeg };

  const h = ((hour % 24) + 24) % 24;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (h < first.timeHours) {
    // Before the first anchor — wrap from the last anchor of the PREVIOUS
    // cycle (last.timeHours - 24) up to the first anchor.
    const prevT = last.timeHours - 24;
    const t = first.timeHours === prevT ? 0 : (h - prevT) / (first.timeHours - prevT);
    return { elevationDeg: lerp(last.elevationDeg, first.elevationDeg, t), azimuthDeg: lerpAngleDeg(last.azimuthDeg, first.azimuthDeg, t) };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (h >= cur.timeHours && h <= next.timeHours) {
      const t = next.timeHours === cur.timeHours ? 0 : (h - cur.timeHours) / (next.timeHours - cur.timeHours);
      return { elevationDeg: lerp(cur.elevationDeg, next.elevationDeg, t), azimuthDeg: lerpAngleDeg(cur.azimuthDeg, next.azimuthDeg, t) };
    }
  }
  // At or after the last anchor — wrap forward to the first anchor of the
  // NEXT cycle (first.timeHours + 24).
  const nextT = first.timeHours + 24;
  const t = nextT === last.timeHours ? 0 : (h - last.timeHours) / (nextT - last.timeHours);
  return { elevationDeg: lerp(last.elevationDeg, first.elevationDeg, t), azimuthDeg: lerpAngleDeg(last.azimuthDeg, first.azimuthDeg, t) };
}

/**
 * Geographic Solar Path (PRD §9) — real elevation/azimuth from a real
 * latitude/longitude/date/time, using the standard declination + hour-
 * angle spherical-astronomy formulas (the same class of formula NOAA's own
 * solar calculator and most open-source sun-position tools use). This is
 * a real, if intentionally approximate, calculation — accurate to within
 * a degree or two, which is what a rendered sun direction needs, not
 * survey-grade precision. No timezone-database lookup: `hourUTC` is
 * treated as UTC and corrected to local solar time via longitude/15,
 * the standard simplification for a globally-portable input with no
 * timezone dependency.
 */
export function geographicSunPosition(
  date: Date,
  latDeg: number,
  lonDeg: number,
  hourUTC: number
): { elevationDeg: number; azimuthDeg: number } {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000);
  const declRad = toRad(23.45) * Math.sin(toRad((360 / 365) * (dayOfYear - 81)));

  const solarTime = hourUTC + lonDeg / 15;
  const hourAngleDeg = 15 * (solarTime - 12);
  const hourAngleRad = toRad(hourAngleDeg);
  const latRad = toRad(latDeg);

  const sinElev = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));

  const cosAz = (Math.sin(declRad) - Math.sin(elevRad) * Math.sin(latRad)) / (Math.cos(elevRad) * Math.cos(latRad) || 1e-9);
  const azRadRaw = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  const azDeg = hourAngleDeg > 0 ? 360 - (azRadRaw * 180) / Math.PI : (azRadRaw * 180) / Math.PI;

  return { elevationDeg: (elevRad * 180) / Math.PI, azimuthDeg: azDeg };
}
