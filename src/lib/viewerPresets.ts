import type { GlassPreset, MaterialPresetId, QualityPreset, SkyPreset, Unit } from "@/lib/types";

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
// X-Ray mode (PRD §51): boosts unit-box opacity above its normal
// idle/selected level so units read clearly once the facade around them
// has been faded, and dims the facade itself down to a near-see-through
// default the admin/buyer can still raise via a slider.
export const UNIT_BOX_XRAY_OPACITY_BOOST = 0.3;
export const XRAY_DEFAULT_FACADE_OPACITY = 0.15;

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
// WebGPU/WebGL2 viewer (ProceduralProjectViewer.tsx). Render/visual
// quality pass adds the real TSL post-processing flags below (bloom/gtao/
// ssr/antialias) — `ssgi` is left in the shape but always `false`,
// documenting a deferred slot rather than silently omitting it: SSGI needs
// the same MRT normal buffer as GTAO/SSR but is materially more expensive
// and, per its own node design, expects a temporal/spatial denoiser
// downstream — the highest-risk effect to wire blind, so it stays off.
// ---------------------------------------------------------------------------

export interface QualityTierSettings {
  renderScale: number; // 0-1, multiplies canvas resolution before the DPR cap
  dprCap: number;
  shadowMapSize: number;
  bloom: boolean;
  gtao: boolean;
  ssr: boolean;
  /** SMAA anti-aliasing (not FXAA — see the Render/visual quality plan's
   * "explicitly deferred" note on why FXAA's required pre-tone-mapped
   * input ordering was skipped rather than guessed at). */
  antialias: boolean;
  /** Always false this pass — see file header comment. */
  ssgi: boolean;
}

export const QUALITY_TIERS: Record<QualityPreset, QualityTierSettings> = {
  ultra_desktop: {
    renderScale: 1,
    dprCap: 2,
    shadowMapSize: 4096,
    bloom: true,
    gtao: true,
    ssr: true,
    antialias: true,
    ssgi: false,
  },
  high_desktop: {
    renderScale: 0.95,
    dprCap: 2,
    shadowMapSize: 2048,
    bloom: true,
    gtao: true,
    ssr: true,
    antialias: true,
    ssgi: false,
  },
  balanced: {
    renderScale: 0.8,
    dprCap: 1.5,
    shadowMapSize: 1536,
    bloom: true,
    gtao: true,
    ssr: false,
    antialias: true,
    ssgi: false,
  },
  mobile_high: {
    renderScale: 0.75,
    dprCap: 1.25,
    shadowMapSize: 1024,
    bloom: true,
    gtao: false,
    ssr: false,
    antialias: false,
    ssgi: false,
  },
  mobile_low: {
    renderScale: 0.6,
    dprCap: 1,
    shadowMapSize: 512,
    bloom: false,
    gtao: false,
    ssr: false,
    antialias: false,
    ssgi: false,
  },
};

/** Order the runtime adaptive-quality sampler steps through when sustained
 * frame time is too high — most expensive/least noticeable first. Render
 * scale isn't in this list: it's the last-resort step, applied directly
 * (not via a boolean flag) once every effect here is already off. */
export const ADAPTIVE_DOWNGRADE_ORDER: (keyof Pick<QualityTierSettings, "ssr" | "bloom" | "gtao" | "antialias">)[] = [
  "ssr",
  "bloom",
  "gtao",
  "antialias",
];

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

export interface MaterialPresetSettings {
  label: string;
  color: number;
  roughness: number;
  metalness: number;
}

/** Non-destructive per-node material presets (Editor UX & Scene Structure
 * pass, PRD §13) — a Scene Explorer override applies one of these (or
 * manual color/roughness/metalness) on top of whatever the GLB's own
 * material already has; "Reset to original" just clears the override,
 * the source material is never touched. Deliberately excludes glass
 * variants (Architectural/Clear/Tinted/Frosted Glass from the PRD's list)
 * — those are already served by the dedicated GLASS_TIERS system above,
 * keyed off `Glass_*` node names; a second, competing glass system here
 * would just create two ways to configure the same node. `label` is a
 * plain English fallback for contexts without an i18n lookup handy (the
 * admin UI itself uses `admin.materialPreset<Id>` keys instead). */
export const MATERIAL_PRESETS: Record<MaterialPresetId, MaterialPresetSettings> = {
  concrete: { label: "Concrete", color: 0x9a9891, roughness: 0.9, metalness: 0 },
  plaster: { label: "Plaster", color: 0xe8e4da, roughness: 0.85, metalness: 0 },
  stone: { label: "Stone", color: 0x8a8378, roughness: 0.75, metalness: 0 },
  wood: { label: "Wood", color: 0x8a5a34, roughness: 0.55, metalness: 0 },
  aluminium: { label: "Aluminium", color: 0xb8bcc2, roughness: 0.35, metalness: 0.85 },
  steel: { label: "Steel", color: 0x6e737a, roughness: 0.4, metalness: 0.9 },
  chrome: { label: "Chrome", color: 0xd8dade, roughness: 0.05, metalness: 1 },
  ceramic: { label: "Ceramic", color: 0xf0efe9, roughness: 0.15, metalness: 0 },
};

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
