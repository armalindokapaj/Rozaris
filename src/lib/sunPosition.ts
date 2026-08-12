/**
 * Real geographic sun position — "3D Experience Phase 1" (spec §4: "do not
 * fake the sun"). Dependency-free NOAA-style simplified solar position
 * algorithm (the same formulas behind NOAA's public Solar Calculator
 * spreadsheet), not a package, since the calculation is compact and this
 * avoids pulling in a timezone-database dependency.
 *
 * `timeOfDay` is treated as a UTC decimal hour (0-24) rather than the
 * project's local civil time — resolving true local civil time needs an
 * IANA timezone lookup keyed off lat/lng, a whole separate dependency this
 * pass deliberately skips. Instead, `lng` does its real job here: the
 * equation-of-time + longitude correction below converts the UTC clock
 * time into true *solar* time (solar noon = the sun's actual highest
 * point at that longitude), which is what the visual sun position should
 * track — every one of the spec's listed inputs (lat, lng, north rotation,
 * date) is actually used, none of them decorative.
 */

export interface SunPositionInput {
  lat: number;
  lng: number;
  /** Any Date — only its UTC calendar day (month/day) feeds the seasonal
   * declination; year is irrelevant. */
  date: Date;
  /** UTC decimal hour, 0-24 (e.g. 14.5 = 14:30 UTC). */
  timeOfDay: number;
  /** Degrees — rotates the resulting azimuth so "north" in the 3D scene
   * lines up with true north for a GLB that wasn't authored north-aligned. */
  northRotationDeg?: number;
}

export interface SunPosition {
  /** Degrees above the horizon; negative once the sun is below it. */
  elevationDeg: number;
  /** Degrees clockwise from the scene's "north" (0 = north, 90 = east),
   * already corrected by `northRotationDeg`. */
  azimuthDeg: number;
  /** True once elevationDeg <= 0 — sun is below the horizon. */
  isNight: boolean;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}
function dayOfYearUTC(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86_400_000) + 1;
}

/** Fractional-year angle (radians) + solar declination (radians) + the
 * equation-of-time correction (minutes) — the three quantities every other
 * calculation below is built from. */
function solarBasics(date: Date, timeOfDay: number) {
  const dayOfYear = dayOfYearUTC(date);
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (timeOfDay - 12) / 24);

  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const declRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  return { eqTimeMin, declRad };
}

/** Real azimuth/elevation for a project's real lat/lng at a given UTC
 * instant — feeds the viewer's DirectionalLight directly (see
 * ProceduralProjectViewer.tsx), replacing the old fake preset-interpolated
 * sun. */
export function calcSunPosition({
  lat,
  lng,
  date,
  timeOfDay,
  northRotationDeg = 0,
}: SunPositionInput): SunPosition {
  const { eqTimeMin, declRad } = solarBasics(date, timeOfDay);

  // True solar time, in minutes since local solar midnight.
  const trueSolarTimeMin = timeOfDay * 60 + eqTimeMin + 4 * lng;
  let hourAngleDeg = trueSolarTimeMin / 4 - 180;
  hourAngleDeg = ((hourAngleDeg + 180) % 360) - 180; // wrap to [-180, 180)
  const hourAngleRad = toRad(hourAngleDeg);

  const latRad = toRad(lat);
  const cosZenith =
    Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  const zenithRad = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const elevationDeg = 90 - toDeg(zenithRad);

  const sinZenith = Math.sin(zenithRad);
  let azimuthDeg: number;
  if (Math.abs(sinZenith) < 1e-6) {
    azimuthDeg = 180; // sun at zenith/nadir — azimuth undefined, pick a stable value
  } else {
    const cosAzimuth =
      (Math.sin(declRad) - Math.sin(latRad) * Math.cos(zenithRad)) / (Math.cos(latRad) * sinZenith);
    const azimuthRad = Math.acos(Math.min(1, Math.max(-1, cosAzimuth)));
    azimuthDeg = toDeg(azimuthRad);
    if (hourAngleDeg > 0) azimuthDeg = 360 - azimuthDeg;
  }

  return {
    elevationDeg,
    azimuthDeg: (azimuthDeg + northRotationDeg + 360) % 360,
    isNight: elevationDeg <= 0,
  };
}

/** Sunrise/sunset for a given date/location, as UTC decimal hours — the
 * Admin editor's read-only "Sunrise / Sunset" display (spec §4). Returns
 * `null` for polar day/night (sun never sets/rises that date+latitude). */
export function calcSunriseSunset(
  lat: number,
  lng: number,
  date: Date
): { sunriseHourUTC: number; sunsetHourUTC: number } | null {
  const { eqTimeMin, declRad } = solarBasics(date, 12);
  const latRad = toRad(lat);
  const cosHourAngle = -Math.tan(latRad) * Math.tan(declRad);
  if (cosHourAngle < -1 || cosHourAngle > 1) return null; // polar day/night
  const haSunsetDeg = toDeg(Math.acos(cosHourAngle));

  const solarNoonUTCMin = 720 - 4 * lng - eqTimeMin;
  const sunriseHourUTC = ((solarNoonUTCMin - 4 * haSunsetDeg) / 60 + 24) % 24;
  const sunsetHourUTC = ((solarNoonUTCMin + 4 * haSunsetDeg) / 60 + 24) % 24;
  return { sunriseHourUTC, sunsetHourUTC };
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
