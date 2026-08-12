import type { GlassPreset, QualityPreset, SkyPreset, Unit } from "@/lib/types";

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
// Applied by ProceduralProjectViewer.tsx to whichever content is loaded —
// procedural unit meshes, or a detailed GLB's own meshes.
export const VIEW_PRESET_MATERIAL: Record<
  ViewPreset,
  { color: number | null; roughness: number; metalness: number; edges: boolean; edgeOpacity: number }
> = {
  realistic: { color: null, roughness: 0.6, metalness: 0.05, edges: false, edgeOpacity: 0 },
  conceptual: { color: 0xd9d4c8, roughness: 1, metalness: 0, edges: true, edgeOpacity: 0.35 },
  sketch: { color: 0xfbfaf7, roughness: 1, metalness: 0, edges: true, edgeOpacity: 0.85 },
};

export const TIME_PRESETS: [string, number][] = [
  ["project.presetMorning", 8],
  ["project.presetMidday", 12],
  ["project.presetAfternoon", 15],
  ["project.presetEvening", 18.5],
  ["project.presetNight", 21],
];

// ---------------------------------------------------------------------------
// "3D Experience Phase 1" — quality/glass/sky tiers for the standalone
// WebGPU/WebGL2 viewer (ProceduralProjectViewer.tsx). Deliberately just
// render scale / DPR cap / shadow resolution / material params for now, not
// a TSL post-processing pipeline (SSGI/SSR/GTAO/DOF/etc.) — see the "3D
// Experience — Planpoint-style rendering, Phase 1" plan for what's deferred
// and why.
// ---------------------------------------------------------------------------

export interface QualityTierSettings {
  renderScale: number; // 0-1, multiplies canvas resolution before the DPR cap
  dprCap: number;
  shadowMapSize: number;
}

export const QUALITY_TIERS: Record<QualityPreset, QualityTierSettings> = {
  ultra_desktop: { renderScale: 1, dprCap: 2, shadowMapSize: 4096 },
  high_desktop: { renderScale: 0.95, dprCap: 2, shadowMapSize: 2048 },
  balanced: { renderScale: 0.8, dprCap: 1.5, shadowMapSize: 1536 },
  mobile_high: { renderScale: 0.75, dprCap: 1.25, shadowMapSize: 1024 },
  mobile_low: { renderScale: 0.6, dprCap: 1, shadowMapSize: 512 },
};

export const QUALITY_PRESET_ORDER: QualityPreset[] = [
  "ultra_desktop",
  "high_desktop",
  "balanced",
  "mobile_high",
  "mobile_low",
];

/** A one-time, best-effort device-tier suggestion (spec §23's static half —
 * no continuous FPS-based downgrading yet, see the Phase 1 plan). Used only
 * to suggest a starting `qualityPreset`, never to silently override an
 * Admin's explicit per-project choice. */
export function pickDefaultQualityTier(): QualityPreset {
  if (typeof navigator === "undefined") return "high_desktop";
  const ua = navigator.userAgent ?? "";
  const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const coarsePointer =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  if (isMobileUA || coarsePointer) {
    return deviceMemory <= 3 ? "mobile_low" : "mobile_high";
  }
  if (deviceMemory <= 4) return "balanced";
  if (deviceMemory >= 8 && dpr >= 2) return "ultra_desktop";
  return "high_desktop";
}

export interface GlassTierSettings {
  transmission: number;
  roughness: number;
  ior: number;
  thickness: number;
}

/** Applied to any GLB node named `Glass_*` (case-insensitive), same
 * naming-convention pattern as `Unit_<number>` boxes. "Performance" keeps
 * transmission off (real transmission is one of the more expensive
 * MeshPhysicalMaterial features) and falls back to plain alpha
 * transparency instead. */
export const GLASS_TIERS: Record<GlassPreset, GlassTierSettings> = {
  performance: { transmission: 0, roughness: 0.25, ior: 1.5, thickness: 0 },
  standard: { transmission: 0.9, roughness: 0.08, ior: 1.5, thickness: 0.02 },
  premium: { transmission: 1, roughness: 0.02, ior: 1.52, thickness: 0.05 },
};
export const GLASS_NODE_PATTERN = /^Glass_/i;

export interface SkyGradientStops {
  top: string;
  horizon: string;
  ground: string;
}

/** Procedural gradient-sky presets (spec §15) — a vertical-gradient
 * equirect texture, backend-agnostic (plain `CanvasTexture`, works
 * identically under WebGPU or WebGL2), fed through `PMREMGenerator` for
 * real environment/reflection lighting instead of today's flat
 * `scene.background = Color`. Not full atmospheric scattering — see the
 * Phase 1 plan for that trade-off. */
export const SKY_GRADIENTS: Record<SkyPreset, SkyGradientStops> = {
  clear_day: { top: "#3a7bd5", horizon: "#bfe0ff", ground: "#e8ecef" },
  soft_day: { top: "#8fb8e0", horizon: "#e3edf5", ground: "#eef1f0" },
  overcast: { top: "#7c848f", horizon: "#a9afb6", ground: "#b7bbb9" },
  golden_hour: { top: "#3a4a7a", horizon: "#ff9d5c", ground: "#7a5a4a" },
  evening: { top: "#0c1440", horizon: "#4a3a6a", ground: "#241f33" },
};
