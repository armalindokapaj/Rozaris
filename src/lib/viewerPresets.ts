import type { Project3DConfig, Unit } from "@/lib/types";

/** The procedural viewer's status colors — design-token based (success/
 * warning/sold). Left as-is; the new GLB unit-box feature uses its own
 * explicit green/yellow/red spec (see UNIT_BOX_COLOR below) rather than
 * reusing this, since that color scheme was specified directly for it. */
export const STATUS_COLOR: Record<Unit["status"], number> = {
  available: 0x23845e, // --color-success
  reserved: 0xa66a12, // --color-warning
  sold: 0x9a9aa3, // --color-sold
};

/** Detailed-GLB unit box colors — explicit spec: green for sale, yellow
 * reserved, red sold, ~80% transparent (opacity 0.2). */
export const UNIT_BOX_COLOR: Record<Unit["status"], number> = {
  available: 0x22c55e,
  reserved: 0xeab308,
  sold: 0xef4444,
};
export const UNIT_BOX_OPACITY = 0.2;
export const UNIT_BOX_SELECTED_OPACITY = 0.65;

export const SELECTED_COLOR = 0x6b55f5; // --color-brand-500
export const GROUND_COLOR = 0xd8d6e6;

export const BACKGROUND_COLOR: Record<Project3DConfig["backgroundPreset"], number> = {
  sky: 0xbfe0ff,
  studio_light: 0xf2f0ff,
  studio_dark: 0x1b1a24,
};

export type ViewPreset = "realistic" | "conceptual" | "sketch";

export const VIEW_PRESETS: [ViewPreset, string][] = [
  ["realistic", "project.viewPresetRealistic"],
  ["conceptual", "project.viewPresetConceptual"],
  ["sketch", "project.viewPresetSketch"],
];

// Material treatment per preset — Realistic keeps real per-unit status
// colors and PBR-ish shading; Conceptual flattens to a uniform massing-
// model gray with edge lines; Sketch goes further (near-white, more
// pronounced edges), the classic "white card model + black outline" look.
// Shared between ProceduralProjectViewer (procedural unit meshes) and
// MapboxProjectViewer/DetailModelLayer (the loaded detailed GLB's meshes).
export const VIEW_PRESET_MATERIAL: Record<
  ViewPreset,
  { color: number | null; roughness: number; metalness: number; edges: boolean; edgeOpacity: number }
> = {
  realistic: { color: null, roughness: 0.6, metalness: 0.05, edges: false, edgeOpacity: 0 },
  conceptual: { color: 0xd9d4c8, roughness: 1, metalness: 0, edges: true, edgeOpacity: 0.35 },
  sketch: { color: 0xfbfaf7, roughness: 1, metalness: 0, edges: true, edgeOpacity: 0.85 },
};

export function defaultHourForPreset(preset: Project3DConfig["lightingPreset"]): number {
  if (preset === "daylight") return 13;
  if (preset === "overcast") return 11;
  return 18.5; // sunset
}

export const TIME_PRESETS: [string, number][] = [
  ["project.presetMorning", 8],
  ["project.presetMidday", 12],
  ["project.presetAfternoon", 15],
  ["project.presetEvening", 18.5],
  ["project.presetNight", 21],
];

/** Buckets the existing 6-22 hour slider into Mapbox Standard's four native
 * `basemap` lightPreset values — used by MapboxProjectViewer's Time of Day
 * panel instead of hand-rolled sun-angle math (there's no live outdoor sun
 * to fake once the scene is a real Mapbox map). */
export function lightPresetForHour(hour: number): "dawn" | "day" | "dusk" | "night" {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}
