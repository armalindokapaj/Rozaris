import type { LightingConfig, QualityPreset, RenderingConfig } from "@/lib/types";
import type { QualityConfig } from "@/lib/render-engine/RenderEngine";

/**
 * Project Viewer → Settings → Quality (2026-08-25, direct instruction:
 * "Quality: Max / High / Medium / Low — users may adapt to these settings
 * manually").
 *
 * Until now the only thing that decided how hard the GPU worked was the
 * admin's own per-project `Project3DConfig.qualityPreset` (Experience
 * Editor → Performance tab), which a visitor on a weaker machine than the
 * one the project was authored on had no way to escape. This module is the
 * visitor-side override: a viewer-local preference (stored alongside the
 * other Settings entries in useViewerPreferences.ts) that, when set to
 * anything other than "auto", takes over from the published preset.
 *
 * Two distinct things happen per level, both real and both live (no
 * remount — see below):
 *
 * 1. RESOLUTION. Each level maps onto one of the existing `QUALITY_TIERS`
 *    entries (viewerPresets.ts), so renderScale/dprCap/shadowMapSize come
 *    from the same single source of truth the admin preset already used —
 *    this deliberately does NOT introduce a second, parallel tier table.
 *    RenderEngine.setQualityConfig() applies all three without a remount.
 *
 * 2. EFFECT CAPS. A level is an upper BOUND on the expensive per-pixel
 *    effects, ANDed with the project's own toggles — exactly the pattern
 *    QUALITY_TIERS' own header comment already describes for `bloom`
 *    ("an upper bound per tier … ANDed with the real per-project toggle").
 *    Lowering quality can only ever turn an effect off, never on: a
 *    project that never enabled bloom does not suddenly get it at Max.
 *
 * `antialiasEnabled` is deliberately NOT capped at any level even though
 * TRAA is not free: it is the one Rendering-tab field that forces a full
 * renderer dispose+re-init (RenderEngine.setRenderingConfig's own doc
 * comment), which would mean a visible black flash and a re-run of
 * syncModels() every time someone touched this control. Same reasoning
 * excludes `renderingMode`. Everything capped below flows through
 * applyRenderingConfig/applyLightingConfig, which are live.
 */
export type ViewerQualityLevel = "auto" | "max" | "high" | "medium" | "low";

/** Menu order, top to bottom. "auto" first — it is the default and means
 * "whatever the project was published with", so nothing changes for the
 * (large majority of) visitors who never open this control. */
export const VIEWER_QUALITY_LEVELS: ViewerQualityLevel[] = ["auto", "max", "high", "medium", "low"];

/** Which existing QUALITY_TIERS entry each manual level resolves to.
 * `mobile_high` is skipped on purpose: with five tiers and four levels
 * something had to give, and the gap that actually matters to a struggling
 * visitor is the bottom one (`mobile_low`, renderScale 0.6 / dprCap 1) —
 * `mobile_high` sits close enough to `balanced` that offering both would
 * be a distinction without a difference in this menu. */
const LEVEL_TO_PRESET: Record<Exclude<ViewerQualityLevel, "auto">, QualityPreset> = {
  max: "ultra_desktop",
  high: "high_desktop",
  medium: "balanced",
  low: "mobile_low",
};

/** Rank used only for the "is this level at or above X" comparisons the
 * caps below are written in terms of. */
const LEVEL_RANK: Record<Exclude<ViewerQualityLevel, "auto">, number> = {
  max: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** What each level allows. `true` = the project's own toggle decides;
 * `false` = forced off regardless. Read as a ladder: every level allows
 * everything the level below it allows, plus more.
 *
 * The ordering is by real cost, roughly as measured by how much of the
 * post pipeline each one adds (postProcessing.ts):
 * - GI/SSGI and volumetric lighting are the two multi-sample raymarching
 *   passes, by far the most expensive things here — first to go.
 * - Depth of field and motion blur each add a real full-screen blur
 *   sampled off the depth/velocity buffers.
 * - Contact shadows and CSM each add extra shadow render passes.
 * - Bloom, lens flare and the 3D LUT are comparatively cheap, and killing
 *   them changes the project's authored look the most, so they only go at
 *   Low, together with sun shadows themselves.
 */
interface QualityCaps {
  gi: boolean;
  volumetricLighting: boolean;
  depthOfField: boolean;
  distanceBlur: boolean;
  motionBlur: boolean;
  contactShadows: boolean;
  csm: boolean;
  bloom: boolean;
  lensFlare: boolean;
  lut: boolean;
  shadows: boolean;
}

function capsFor(level: Exclude<ViewerQualityLevel, "auto">): QualityCaps {
  const rank = LEVEL_RANK[level];
  return {
    gi: rank >= LEVEL_RANK.max,
    volumetricLighting: rank >= LEVEL_RANK.max,
    depthOfField: rank >= LEVEL_RANK.high,
    // One separable half-res gaussian + a mix, vs. DOF's six full render
    // targets and 80 bokeh taps — genuinely cheaper, so it survives a tier
    // longer. It also carries more of a project's authored look than DOF
    // does (it is what keeps a large site from reading as clutter), which
    // is the same reasoning that keeps bloom/LUT alive down to Medium.
    distanceBlur: rank >= LEVEL_RANK.medium,
    motionBlur: rank >= LEVEL_RANK.high,
    contactShadows: rank >= LEVEL_RANK.medium,
    csm: rank >= LEVEL_RANK.medium,
    bloom: rank >= LEVEL_RANK.medium,
    lensFlare: rank >= LEVEL_RANK.medium,
    lut: rank >= LEVEL_RANK.medium,
    shadows: rank >= LEVEL_RANK.medium,
  };
}

/** Swaps in the level's own preset and drops the admin's Custom-profile
 * numeric overrides — `customRenderScale`/`customDprCap` only apply to the
 * `custom` preset (resolveQualityTarget in RenderEngine.ts), so leaving
 * them set while forcing a named preset would be harmless but misleading.
 * `adaptiveQualityEnabled`/`runtimeQualityReductionEnabled` are left alone:
 * those are the engine's own FPS-driven safety nets and a visitor picking
 * "Max" on a machine that cannot hold it should still get rescued. */
export function applyViewerQuality(level: ViewerQualityLevel, config: QualityConfig): QualityConfig {
  if (level === "auto") return config;
  return { ...config, qualityPreset: LEVEL_TO_PRESET[level], customRenderScale: null, customDprCap: null };
}

export function applyViewerQualityToRendering(level: ViewerQualityLevel, config: RenderingConfig): RenderingConfig {
  if (level === "auto") return config;
  const caps = capsFor(level);
  return {
    ...config,
    bloomEnabled: config.bloomEnabled && caps.bloom,
    lensFlareEnabled: config.lensFlareEnabled && caps.lensFlare,
    depthOfFieldEnabled: config.depthOfFieldEnabled && caps.depthOfField,
    distanceBlurEnabled: config.distanceBlurEnabled && caps.distanceBlur,
    motionBlurEnabled: config.motionBlurEnabled && caps.motionBlur,
    lutEnabled: config.lutEnabled && caps.lut,
  };
}

export function applyViewerQualityToLighting(level: ViewerQualityLevel, config: LightingConfig): LightingConfig {
  if (level === "auto") return config;
  const caps = capsFor(level);
  return {
    ...config,
    shadowsEnabled: config.shadowsEnabled && caps.shadows,
    contactShadowsEnabled: config.contactShadowsEnabled && caps.contactShadows,
    csmEnabled: config.csmEnabled && caps.csm,
    giEnabled: config.giEnabled && caps.gi,
    volumetricLightingEnabled: config.volumetricLightingEnabled && caps.volumetricLighting,
  };
}
