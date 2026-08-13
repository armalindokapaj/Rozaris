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

export const SELECTED_COLOR = 0x6b55f5; // --color-brand-500
// The old hardcoded ground color constant (0xd8d6e6) was removed when
// Ground Platform made `Project3DConfig.groundColor` the one real source
// for it (Sky/Water/Bloom/Clouds follow-up) — its default value is the
// same hex, so existing projects render identically until an admin
// changes it.

/** Physical-sky dome (`SkyMesh`) scale and water-plane extent, in scene
 * units — both fixed, not per-project fields (Sky/Water/Bloom/Clouds
 * pass, matches the webgl_shaders_ocean.html reference exactly: neither
 * is admin-configurable there either, only their surface-look uniforms
 * are). Kept comfortably inside the viewer's fixed camera far plane
 * (2000, see RenderEngine.ts's `mount()`) regardless of a project's own
 * bounding radius. */
export const SKY_DOME_SCALE = 1600;
export const WATER_PLANE_SIZE = 1600;
/** Ground Platform's "infinite" style (Sky/Water/Bloom/Clouds pass'
 * same-day follow-up) — a separate constant from `WATER_PLANE_SIZE`
 * despite sharing the same value/reasoning (large enough to read as
 * infinite, safely inside the fixed camera far plane) so the two aren't
 * accidentally coupled if either is retuned later. */
export const GROUND_INFINITE_SIZE = 1600;

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
// quality pass adds the real TSL post-processing flags below (bloom/
// antialias) — `ssgi` is left in the shape but always `false`, documenting
// a deferred slot rather than silently omitting it: SSGI expects a
// temporal/spatial denoiser downstream — the highest-risk effect to wire
// blind, so it stays off.
//
// `gtao`/`ssr` (screen-space AO/reflections) existed on this file earlier
// the same day, force-disabled platform-wide, then re-enabled on
// desktop-oriented tiers with a targeted HDR-safety-clamp mitigation —
// see [[rozaris-3d-ssr-gtao-reenable]]/[[rozaris-3d-ssr-gtao-removal]] for
// that history. **Removed outright, not just disabled, on 2026-08-13**
// (explicit user request), after being implicated as a likely contributor
// to a real, live Sections-panel instability report — that TSL chain
// (RenderEngine.ts `buildRenderPipeline`, pre-removal) was the confirmed
// source of two separate, still-unexplained real-GPU failures (a black
// viewer, then solid red) even after 3 real node-wiring bugs in it were
// found and fixed; rather than keep chasing an unverifiable-without-a-
// browser crash class, the effects, their MRT normal/metalness/roughness
// buffers, and the HDR clamp that only existed to support them are all
// gone from `RenderEngine.ts` too — no dead, do-nothing toggle left
// anywhere (`Project3DConfig.ssrEnabled`/`gtaoEnabled` are gone from the
// schema/DB entirely, see the migration).
//
// `bloom` here is an upper bound per tier ("can this device afford it"),
// ANDed with the real per-project `Project3DConfig.bloomEnabled` toggle in
// RenderEngine.ts's buildRenderPipeline — same AND-gate pattern
// antialiasEnabled already uses against `tier.antialias`. Turned back on
// for the three desktop-oriented tiers (Sky/Water/Bloom/Clouds pass,
// same day as the SSR/GTAO removal above) — bloom itself, a single
// self-contained TSL node with no MRT/extra buffers, was never
// implicated in either of that chain's real-GPU failures. Mobile tiers
// stay `false` for performance, same reasoning `antialias` already uses
// there.
// The real geographic sun, ambient light and PMREM sky environment/
// reflections (`rebuildEnvironment`/`applySunAndEnvironment`) are what
// deliver the realistic sky dome and were never implicated in either
// failure, also untouched. `antialias` (SMAA, a separate, much simpler
// effect applied to the plain scene-pass color) is unaffected too.
// ---------------------------------------------------------------------------

export interface QualityTierSettings {
  renderScale: number; // 0-1, multiplies canvas resolution before the DPR cap
  dprCap: number;
  shadowMapSize: number;
  bloom: boolean;
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
    antialias: true,
    ssgi: false,
  },
  high_desktop: {
    renderScale: 0.95,
    dprCap: 2,
    shadowMapSize: 2048,
    bloom: true,
    antialias: true,
    ssgi: false,
  },
  balanced: {
    renderScale: 0.8,
    dprCap: 1.5,
    shadowMapSize: 1536,
    bloom: true,
    antialias: true,
    ssgi: false,
  },
  mobile_high: {
    renderScale: 0.75,
    dprCap: 1.25,
    shadowMapSize: 1024,
    bloom: false,
    antialias: false,
    ssgi: false,
  },
  mobile_low: {
    renderScale: 0.6,
    dprCap: 1,
    shadowMapSize: 512,
    bloom: false,
    antialias: false,
    ssgi: false,
  },
};

/** Order the runtime adaptive-quality sampler steps through when sustained
 * frame time is too high — most expensive/least noticeable first. Render
 * scale isn't in this list: it's the last-resort step, applied directly
 * (not via a boolean flag) once every effect here is already off. */
export const ADAPTIVE_DOWNGRADE_ORDER: (keyof Pick<QualityTierSettings, "bloom" | "antialias">)[] = [
  "bloom",
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

/** Originally the procedural sky itself (a vertical-gradient
 * `CanvasTexture` fed through `PMREMGenerator`) — the Sky/Water/Bloom/
 * Clouds pass replaced that with a real physically-based sky dome
 * (`SkyMesh`, see `SKY_PHYSICAL_PARAMS` below and RenderEngine.ts's
 * `rebuildEnvironment`). These gradient stops now only feed
 * `resolveFogColor`'s `fogMatchesSky` fallback (an HDRI has no
 * equivalently-cheap single "horizon color" to derive either way, so both
 * cases already accepted an approximation, not a regression). */
export const SKY_GRADIENTS: Record<SkyPreset, SkyGradientStops> = {
  clear_day: { top: "#3a7bd5", horizon: "#bfe0ff", ground: "#e8ecef" },
  soft_day: { top: "#8fb8e0", horizon: "#e3edf5", ground: "#eef1f0" },
  overcast: { top: "#7c848f", horizon: "#a9afb6", ground: "#b7bbb9" },
  golden_hour: { top: "#3a4a7a", horizon: "#ff9d5c", ground: "#7a5a4a" },
  evening: { top: "#0c1440", horizon: "#4a3a6a", ground: "#241f33" },
};

export interface SkyPhysicalParams {
  /** Atmospheric haze — higher looks hazier/more washed out. */
  turbidity: number;
  /** Rayleigh scattering coefficient — drives blue-sky intensity. */
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

/** Preetham-model atmospheric parameters for `SkyMesh` (Sky/Water/Bloom/
 * Clouds pass) — one fixed, tuned tuple per existing `skyPreset`, the same
 * "Admin picks a controlled preset rather than authoring raw shader
 * uniforms" approach `SKY_GRADIENTS` above already used, so the existing
 * Sky preset dropdown keeps producing 5 visually distinct results instead
 * of gaining a second, competing set of manual turbidity/rayleigh/mie
 * sliders (webgl_shaders_ocean.html hardcodes one fixed tuple the same
 * way — its GUI never exposes these either, only elevation/azimuth/
 * exposure, which this app already has via the Sun & Time and Exposure
 * sub-tabs). Sun elevation/azimuth/color still come from the real
 * geographic/manual sun (`applySunAndEnvironment`) exactly as before —
 * only the sky dome's own atmosphere physics are preset-driven. */
export const SKY_PHYSICAL_PARAMS: Record<SkyPreset, SkyPhysicalParams> = {
  clear_day: { turbidity: 4, rayleigh: 2.4, mieCoefficient: 0.004, mieDirectionalG: 0.78 },
  soft_day: { turbidity: 6, rayleigh: 1.6, mieCoefficient: 0.006, mieDirectionalG: 0.8 },
  overcast: { turbidity: 18, rayleigh: 0.6, mieCoefficient: 0.02, mieDirectionalG: 0.9 },
  golden_hour: { turbidity: 8, rayleigh: 3, mieCoefficient: 0.01, mieDirectionalG: 0.85 },
  evening: { turbidity: 10, rayleigh: 1.2, mieCoefficient: 0.012, mieDirectionalG: 0.88 },
};
