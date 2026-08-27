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
 * encodes direction toward the target, not a real distance).
 *
 * `z` is NEGATED because `azimuthDeg` is measured clockwise from north
 * (see `SunPosition`) while +Z here is south: azimuth 0 has to land on
 * -Z. Until 2026-08-27 it was `+cos(az)`, which is not a rotation of the
 * right answer but a REFLECTION of it across the east-west axis — east
 * and west stayed correct while north and south swapped, so the sun rose
 * in the east and set in the west but crossed the northern half of the
 * sky. At Vlorë (41.3°N) on 21 June the old code put the sun on the north
 * side from 07:00 to 15:00; every northern-hemisphere day is meant to be
 * south the whole way. Reflections also reverse the sense of rotation,
 * which is what made it read as "the sun rotates the wrong way" while
 * scrubbing time, and why no `northOffsetDeg` value could ever fix it —
 * an offset rotates the arc, it cannot un-mirror it. */
export function sunDirectionVector(pos: Pick<SunPosition, "elevationDeg" | "azimuthDeg">): { x: number; y: number; z: number } {
  const elevRad = toRad(pos.elevationDeg);
  const azRad = toRad(pos.azimuthDeg);
  return {
    x: Math.cos(elevRad) * Math.sin(azRad),
    y: Math.sin(elevRad),
    z: -Math.cos(elevRad) * Math.cos(azRad),
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

/**
 * Project Viewer Sun & Time PRD (2026-08-16) §10 "Sunrise/Sunset are
 * calculated dynamically" + §21-22 "Recommended Preset Logic" — both need
 * to know where an elevation curve crosses the horizon and where it peaks,
 * regardless of whether that curve comes from real lat/lng astronomy
 * (geographic mode) or an admin-authored anchor curve (manual mode) — the
 * caller only hands this an `elevationAt(hour)` function, it doesn't care
 * which. Samples at 5-minute resolution across the day (cheap — this only
 * runs when date/mode/anchors actually change, never per drag-frame) and
 * linearly interpolates the exact crossing between the two bracketing
 * samples.
 *
 * Known limitation (documented, not fixed): if the day's peak elevation
 * itself falls exactly at hour 0/24 (curve peaks at midnight), the
 * backward/forward walk from that index finds no crossing and reports
 * `sunriseHour`/`sunsetHour` as null even on an otherwise ordinary day/
 * night curve. Real geographic solar noon is never near midnight for any
 * latitude this platform serves, and a manual anchor curve authored to
 * peak at midnight is a deliberately unusual choice — an intentionally
 * approximate edge case, same spirit as geographicSunPosition's own doc
 * comment above.
 */
export interface SunTimeline {
  /** Hour (0-24) of the rising horizon crossing nearest solar noon; null
   * if the sun never rises or never sets that day. */
  sunriseHour: number | null;
  sunsetHour: number | null;
  /** Hour of peak elevation — always defined, even on an always-up/-down day. */
  solarNoonHour: number;
  alwaysUp: boolean;
  alwaysDown: boolean;
}

const SUN_TIMELINE_SAMPLES = 24 * 12; // 5-minute resolution

export function computeSunTimeline(elevationAt: (hour: number) => number): SunTimeline {
  const samples: number[] = [];
  for (let i = 0; i <= SUN_TIMELINE_SAMPLES; i++) samples.push(elevationAt((i / SUN_TIMELINE_SAMPLES) * 24));

  let peakIdx = 0;
  for (let i = 1; i <= SUN_TIMELINE_SAMPLES; i++) {
    if (samples[i] > samples[peakIdx]) peakIdx = i;
  }
  const solarNoonHour = (peakIdx / SUN_TIMELINE_SAMPLES) * 24;
  const alwaysUp = samples.every((v) => v > 0);
  const alwaysDown = samples.every((v) => v <= 0);
  if (alwaysUp || alwaysDown) {
    return { sunriseHour: null, sunsetHour: null, solarNoonHour, alwaysUp, alwaysDown };
  }

  const hourAt = (i: number) => (i / SUN_TIMELINE_SAMPLES) * 24;
  let sunriseHour: number | null = null;
  for (let i = peakIdx; i > 0; i--) {
    if (samples[i - 1] <= 0 && samples[i] > 0) {
      const t = samples[i - 1] / (samples[i - 1] - samples[i]);
      sunriseHour = hourAt(i - 1) + t * (hourAt(i) - hourAt(i - 1));
      break;
    }
  }
  let sunsetHour: number | null = null;
  for (let i = peakIdx; i < SUN_TIMELINE_SAMPLES; i++) {
    if (samples[i] > 0 && samples[i + 1] <= 0) {
      const t = samples[i] / (samples[i] - samples[i + 1]);
      sunsetHour = hourAt(i) + t * (hourAt(i + 1) - hourAt(i));
      break;
    }
  }
  return { sunriseHour, sunsetHour, solarNoonHour, alwaysUp: false, alwaysDown: false };
}

/** Sun & Time PRD §21-22 "Recommended Preset Logic" — Morning/Noon/Golden
 * Hour/Evening derived from the timeline above rather than fixed clock
 * times, so they adapt to season/geography (or an admin's manual curve)
 * automatically. A preset whose anchor is null (no real sunrise/sunset
 * that day) is omitted rather than guessed. */
export interface SunTimePreset {
  id: "morning" | "noon" | "goldenHour" | "evening";
  hour: number;
}

export function sunTimelinePresets(timeline: SunTimeline): SunTimePreset[] {
  const presets: SunTimePreset[] = [{ id: "noon", hour: timeline.solarNoonHour }];
  if (timeline.sunriseHour != null) presets.unshift({ id: "morning", hour: timeline.sunriseHour + 2 });
  if (timeline.sunsetHour != null) {
    presets.push({ id: "goldenHour", hour: timeline.sunsetHour - 0.75 });
    presets.push({ id: "evening", hour: timeline.sunsetHour + 1 / 3 });
  }
  return presets;
}

/** The viewer's own scrub window, already reduced to whole hours — see
 * `ProjectViewerRuntime`'s `sunTimeWindow` for where the admin's
 * Start/End/Step land on this shape. `stepHours` is the grid the two
 * helpers below snap onto, and the grid is anchored at `startHours`
 * (never at midnight) because that is what a native `<input type="range">`
 * does with its own `min`/`step` — anchoring anywhere else would let the
 * two disagree by a fraction of a step. */
export interface SunTimeWindow {
  startHours: number;
  endHours: number;
  stepHours: number;
}

/** Clamp `hours` into the window, then snap it to the window's hour grid.
 * The viewer's time bar reads whole hours (direct instruction,
 * 2026-08-27), and clamping is what keeps the readout, the slider thumb
 * and the sun itself telling the same story: the readout is free-form
 * text, but the thumb can only sit between `min` and `max`, so an
 * out-of-window time used to park the thumb at one end while the label
 * said something else. */
export function snapSunTimeHours(hours: number, window: SunTimeWindow): number {
  const step = Math.max(1, Math.round(window.stepHours));
  const clamped = Math.min(Math.max(hours, window.startHours), window.endHours);
  const snapped = window.startHours + Math.round((clamped - window.startHours) / step) * step;
  return Math.min(Math.max(snapped, window.startHours), window.endHours);
}

/** `sunTimelinePresets` above answers "when is morning?" astronomically —
 * a real, fractional, unbounded hour (Tirana on 21 June: morning 05:11,
 * noon 10:40, golden hour 17:25). This answers the different question the
 * viewer's Time dock actually asks: "which stop on THIS slider is
 * morning?" Two things happen here:
 *
 *  1. Each preset is clamped into the admin's scrub window and snapped to
 *     its hour grid. Before this, picking Morning on a project whose
 *     window starts at 06:00 drove the sun to 05:11 — outside the window
 *     the admin authored, with the thumb stuck at the left end and the
 *     readout disagreeing with it.
 *  2. Presets that collapse onto the same stop are de-duplicated, keeping
 *     whichever one's true time is nearest that stop. A 05:00-14:00
 *     window would otherwise offer both "Golden Hour" and "Evening" at
 *     14:00 — two labels, one identical sun.
 *
 * Order is preserved (morning → noon → golden hour → evening); `noon`
 * always survives, so the result is never empty. */
export function snapSunTimePresets(presets: SunTimePreset[], window: SunTimeWindow): SunTimePreset[] {
  const byStop = new Map<number, { preset: SunTimePreset; drift: number; order: number }>();
  presets.forEach((preset, order) => {
    const hour = snapSunTimeHours(preset.hour, window);
    const drift = Math.abs(preset.hour - hour);
    const held = byStop.get(hour);
    if (!held || drift < held.drift) byStop.set(hour, { preset: { id: preset.id, hour }, drift, order });
  });
  return [...byStop.values()].sort((a, b) => a.order - b.order).map((entry) => entry.preset);
}
