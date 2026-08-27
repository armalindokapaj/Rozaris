import type { LightingConfig, RenderingConfig } from "@/lib/types";

/**
 * `?fx=` — turn individual screen-space passes off from the URL, on the
 * device that is actually failing.
 *
 * Why this exists: the post chain (postProcessing.ts) composes its passes
 * by MULTIPLYING and ADDING them into one node graph, so a single pass
 * that misbehaves takes the whole image with it. The worst of these is
 * SSGI's ambient-occlusion term, which is applied as
 * `chain.mul(vec3(aoTerm))` — every pixel of the frame times that pass's
 * output. If the raymarch behind it reports full occlusion, `pow(0, aoI)`
 * is 0 and the entire viewer renders black except the sky, which sits at
 * the far plane and is skipped. That exact picture was reproduced here on
 * a desktop by forcing the AO term down, so the mechanism is not in
 * question — only which device makes it happen.
 *
 * And it can only be answered ON the device. These passes are screen-space
 * raymarches over the depth/normal buffers, i.e. precisely the code whose
 * behaviour depends on the GPU, the backend and the driver. A desktop
 * cannot rule any of them in or out for a phone, WebKit ships no
 * remote-inspectable build here, and Playwright's WebKit exposes no WebGPU
 * at all — so there is no way to reproduce Apple's WebGPU locally. Rather
 * than guess which pass to disable and ship a third blind fix, this makes
 * the phone able to answer in one tap.
 *
 * Deliberately a VIEW-time override, not a config write: nothing here
 * touches Project3DConfig, so a visitor bisecting a render never changes
 * what anyone else sees, and the published look is exactly what it was.
 *
 * Grammar: `?fx=-gi`, `?fx=-gi,-ssr`, or `?fx=none` for every pass at
 * once. Unknown tokens are ignored rather than throwing — this is a
 * debugging aid reached by hand-typed URL, and a typo should degrade to
 * "no override", never to a broken viewer.
 */
export type EffectName = "gi" | "ssr" | "traa" | "bloom" | "motionblur" | "lut" | "dof" | "distanceblur" | "volumetric";

/** Order matters only for display — this is the order the bisect buttons
 * appear in, most-likely-culprit first. `gi` leads because it is the one
 * pass that multiplies the whole frame. */
export const BISECTABLE_EFFECTS: EffectName[] = [
  "gi",
  "ssr",
  "traa",
  "motionblur",
  "bloom",
  "lut",
  "dof",
  "distanceblur",
  "volumetric",
];

export type EffectOverrides = Set<EffectName>;

const EFFECT_LOOKUP = new Set<string>(BISECTABLE_EFFECTS);

/**
 * Parses the `fx` parameter out of a `location.search` string.
 *
 * Takes the raw search string rather than reading `window` itself so this
 * stays a pure function — callers on the server pass "" and get an empty
 * set, which is what makes it safe to use inside a `useMemo` that also
 * runs during SSR.
 */
export function parseEffectOverrides(search: string): EffectOverrides {
  const raw = new URLSearchParams(search).get("fx");
  if (!raw) return new Set();
  const disabled: EffectOverrides = new Set();
  for (const rawToken of raw.split(",")) {
    const token = rawToken.trim().toLowerCase();
    if (token === "none") return new Set(BISECTABLE_EFFECTS);
    // A leading "-" reads naturally ("-gi" = minus GI) but is noise to
    // parse against, so it is stripped rather than required: `?fx=gi` and
    // `?fx=-gi` both mean the same thing, because someone typing this on
    // a phone keyboard should not have to get the punctuation right.
    const name = token.startsWith("-") ? token.slice(1) : token;
    if (EFFECT_LOOKUP.has(name)) disabled.add(name as EffectName);
  }
  return disabled;
}

/** Serialises back to a `fx` value, so the diagnostics panel can build
 * "turn this one off" links without duplicating the grammar. */
export function formatEffectOverrides(disabled: EffectOverrides): string {
  return [...disabled].map((name) => `-${name}`).join(",");
}

/**
 * Applies the overrides to a lighting config. Composed OVER
 * `applyViewerQualityToLighting`, never instead of it: a `?fx=` override
 * can only ever turn a pass OFF, exactly like the quality ladder, so the
 * two compose in either order without one re-enabling what the other
 * disabled.
 */
export function applyEffectOverridesToLighting(disabled: EffectOverrides, config: LightingConfig): LightingConfig {
  if (disabled.size === 0) return config;
  return {
    ...config,
    giEnabled: config.giEnabled && !disabled.has("gi"),
    volumetricLightingEnabled: config.volumetricLightingEnabled && !disabled.has("volumetric"),
  };
}

/** The rendering-config half of the same override. */
export function applyEffectOverridesToRendering(disabled: EffectOverrides, config: RenderingConfig): RenderingConfig {
  if (disabled.size === 0) return config;
  return {
    ...config,
    ssrEnabled: config.ssrEnabled && !disabled.has("ssr"),
    antialiasEnabled: config.antialiasEnabled && !disabled.has("traa"),
    bloomEnabled: config.bloomEnabled && !disabled.has("bloom"),
    motionBlurEnabled: config.motionBlurEnabled && !disabled.has("motionblur"),
    lutEnabled: config.lutEnabled && !disabled.has("lut"),
    depthOfFieldEnabled: config.depthOfFieldEnabled && !disabled.has("dof"),
    distanceBlurEnabled: config.distanceBlurEnabled && !disabled.has("distanceblur"),
  };
}
