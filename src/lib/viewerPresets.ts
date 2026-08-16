import type { GlassPreset, MaterialPresetId, QualityPreset, Unit } from "@/lib/types";

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

/** Public-viewer "Sun Orientation" bottom-menu control (2026-08-14, re-add
 * of the removed Time of Day scrubber — see its own doc comment history in
 * `Project3DConfig`/`sunPosition.ts`). That old control drove a real
 * geographic solar-position calculator from an "hour" input; that whole
 * calculator was removed along with it, so this isn't a revival of the
 * same mechanism — `sunPositionForHour` (sunPosition.ts) is a new, simple,
 * non-geographic east-to-west arc instead. Bounds match the second pass
 * of this feature (user: "move the time from 6am to 8pm"), narrower than
 * the old scrubber's 6-22 range. A client-only override on top of
 * whatever the admin authored on the Sky tab — never written back to
 * `Project3DConfig`, purely a visitor display preference, same as the old
 * scrubber's `timeOfDay` was never persisted either. */
export const SUN_HOUR_MIN = 6;
export const SUN_HOUR_MAX = 20;

/** Dropdown presets (2nd pass: user asked for the 5 presets in a dropdown
 * alongside the slider, not as their own button row). Reuses the existing
 * `project.presetMorning/presetMidday/presetAfternoon/presetEvening/
 * presetNight` label keys (already translated) — the old `TIME_PRESETS`
 * array they used to key off had its own "Night" anchor at 21:00, outside
 * this pass's 6-20 slider bounds, so it's pulled in to 20:00 (the
 * slider's own late edge — reads as dusk, not literal darkness, but keeps
 * every preset reachable on the slider). */
export const SUN_PRESET_HOURS: { key: string; hour: number }[] = [
  { key: "project.presetMorning", hour: 8 },
  { key: "project.presetMidday", hour: 12 },
  { key: "project.presetAfternoon", hour: 15 },
  { key: "project.presetEvening", hour: 18 },
  { key: "project.presetNight", hour: 20 },
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
  /** 3D LUT color grading (`webgl_postprocessing_3dlut.html` parity) — a
   * single extra `texture3D` sample per pixel via TSL's `lut3D()` node,
   * cheap relative to bloom/motion blur, but still gated per-tier for the
   * same "off on mobile" consistency the other post-processing flags use. */
  lut: boolean;
  /** Depth of field (`webgl_postprocessing_dof2.html` parity) — TSL
   * `dof()` node, a real bokeh blur sampled from the scene's `viewZ`
   * (depth) buffer. Off on mobile tiers, same reasoning as the others. */
  depthOfField: boolean;
  /** Unit-status caustics (`webgpu_caustics.html` parity, adapted) — a
   * real per-unit animated texture sample + emissive-node upgrade, cheap
   * per-unit but scales with unit count, so it stays off on mobile tiers
   * like the other per-pixel effect flags here. */
  caustics: boolean;
}

export const QUALITY_TIERS: Record<QualityPreset, QualityTierSettings> = {
  ultra_desktop: {
    renderScale: 1,
    dprCap: 2,
    shadowMapSize: 4096,
    bloom: true,
    antialias: true,
    ssgi: false,
    lut: true,
    depthOfField: true,
    caustics: true,
  },
  high_desktop: {
    renderScale: 0.95,
    dprCap: 2,
    shadowMapSize: 2048,
    bloom: true,
    antialias: true,
    ssgi: false,
    lut: true,
    depthOfField: true,
    caustics: true,
  },
  balanced: {
    renderScale: 0.8,
    dprCap: 1.5,
    shadowMapSize: 1536,
    bloom: true,
    antialias: true,
    ssgi: false,
    lut: true,
    depthOfField: false,
    caustics: true,
  },
  mobile_high: {
    renderScale: 0.75,
    dprCap: 1.25,
    shadowMapSize: 1024,
    bloom: false,
    antialias: false,
    ssgi: false,
    lut: false,
    depthOfField: false,
    caustics: false,
  },
  mobile_low: {
    renderScale: 0.6,
    dprCap: 1,
    shadowMapSize: 512,
    bloom: false,
    antialias: false,
    ssgi: false,
    lut: false,
    depthOfField: false,
    caustics: false,
  },
  /** Experience Editor v2, Performance tab (PRD §40) — "Custom" profile.
   * These are only the FALLBACKs; the real values come from
   * Project3DConfig.customRenderScale/customDprCap when set (see
   * RenderEngine.ts's setQualityConfig). Everything else here matches
   * high_desktop — Phase 2-4 features (shadows/bloom/ssgi/lut/DOF) aren't
   * in the new engine yet regardless of profile. */
  custom: {
    renderScale: 0.95,
    dprCap: 2,
    shadowMapSize: 2048,
    bloom: true,
    antialias: true,
    ssgi: false,
    lut: true,
    depthOfField: true,
    caustics: true,
  },
};

/** Real vendored LUT files — every option `webgl_postprocessing_3dlut.html`'s
 * own reference GUI exposes (its `lutMap`), same "vendor the demo's real
 * asset" precedent as Water's waternormals.jpg — see `public/luts/`. Label
 * is shown in the admin preset dropdown; `file` is the vendored filename,
 * `format` picks which loader `loadLut` (RenderEngine.ts) dispatches to,
 * matching the reference demo's own extension-based branch exactly:
 * `"cube"` → `LUTCubeLoader`, `"3dl"` → `LUT3dlLoader`, `"image"` → a real
 * LUT-strip PNG via `LUTImageLoader`. The 5 `.CUBE` files are each
 * `LUT_3D_SIZE 32`; `loadLut` reads the loader's own reported `.size` at
 * runtime rather than trusting a hardcoded number here either way, so this
 * type intentionally carries no `size` field. */
export const LUT_PRESETS = [
  { id: "bourbon64", label: "Bourbon 64", file: "Bourbon 64.CUBE", format: "cube" },
  { id: "chemical168", label: "Chemical 168", file: "Chemical 168.CUBE", format: "cube" },
  { id: "clayton33", label: "Clayton 33", file: "Clayton 33.CUBE", format: "cube" },
  { id: "cubicle99", label: "Cubicle 99", file: "Cubicle 99.CUBE", format: "cube" },
  { id: "remy24", label: "Remy 24", file: "Remy 24.CUBE", format: "cube" },
  { id: "presetproCinematic", label: "Presetpro Cinematic", file: "Presetpro-Cinematic.3dl", format: "3dl" },
  { id: "neutral", label: "Neutral", file: "NeutralLUT.png", format: "image" },
  { id: "blackAndWhite", label: "Black & White", file: "B&WLUT.png", format: "image" },
  { id: "night", label: "Night", file: "NightLUT.png", format: "image" },
] as const satisfies readonly { id: string; label: string; file: string; format: "cube" | "3dl" | "image" }[];

export const LUT_PRESET_IDS = LUT_PRESETS.map((p) => p.id) as [string, ...string[]];

/** Order the runtime adaptive-quality sampler steps through when sustained
 * frame time is too high — most expensive/least noticeable first. Render
 * scale isn't in this list: it's the last-resort step, applied directly
 * (not via a boolean flag) once every effect here is already off. */
export const ADAPTIVE_DOWNGRADE_ORDER: (keyof Pick<
  QualityTierSettings,
  "bloom" | "antialias" | "lut" | "depthOfField"
>)[] = [
  "depthOfField",
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

/** Fixed fallback horizon color for `resolveFogColor`'s `fogMatchesSky`
 * branch (RenderEngine.ts) — the Sky/Water/Bloom/Clouds "Ocean" tab
 * removed the old per-project `skyPreset` gradient system entirely (the
 * physical `SkyMesh` is now the only backdrop, with no cheap single
 * "horizon color" to derive from its continuous elevation/azimuth-driven
 * atmosphere without an expensive readback), so this is one fixed,
 * reasonable approximation rather than 5 preset-driven ones — was the old
 * `"clear_day"` preset's own horizon stop, kept as-is. */
export const FOG_SKY_HORIZON_COLOR = "#bfe0ff";

// Preetham-model atmospheric parameters for `SkyMesh` (turbidity/rayleigh/
// mieCoefficient/mieDirectionalG) used to be one fixed constant here
// (`SKY_PHYSICAL_PARAMS`, itself the old `"clear_day"` preset's own
// tuple). The new standalone "Sky" tab (webgl_shaders_sky.html parity,
// 2026-08-14) made them real per-project `Project3DConfig` columns
// instead — see Project3DConfig's own doc comment in prisma/schema.prisma
// for the exact defaults (kept identical to this constant's old values,
// so no existing project's rendered sky changed when the column landed).
