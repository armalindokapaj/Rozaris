/**
 * Lighting → Sun Light (PRD §15) — Kelvin color-temperature input as a
 * convenience alternate to picking a raw hex color directly. Standard
 * Tanner Helland Planckian-locus approximation (the same well-known
 * algorithm most black-body-color pickers use) — real, if approximate;
 * accurate enough for a rendered sun tint, not scientific-instrument
 * grade.
 */
export function kelvinToHex(kelvin: number): string {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
