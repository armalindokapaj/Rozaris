import { z } from "zod";
import { LUT_PRESET_IDS } from "./viewerPresets";
import type { Project3DConfig } from "./types";

/**
 * Environment Presets ("1 preset for every Sun, Fog, Sunflare... setting,
 * to use in other projects") — a curated, portable subset of
 * `Project3DConfig` considered "atmosphere/look" rather than
 * project-specific. Deliberately EXCLUDES camera framing, quality/
 * performance tier, ground, unit status colors/caustics, Sections, and the
 * heavier Shadows/GI/DoF/SSR/Motion-Blur systems — those are tuned to each
 * project's own GLB scale/triangle budget or branding, so bundling them
 * into a cross-project "look" preset would silently mis-apply values tuned
 * for a different model (a 200m CSM shadow distance authored on a tower
 * project landing on a small villa, for example). Kept in a dedicated file
 * (not inlined in the API route) because it's the single source of truth
 * for both `/api/environment-presets` validation AND the Presets tab's
 * grouped "what's included" UI — the two can never drift apart.
 *
 * Field ranges mirror `/api/project-3d-config`'s own `patchSchema` exactly
 * (copied, not imported — that route's schema isn't exported, and
 * duplicating validated ranges for a second, differently-scoped schema is
 * the same precedent `sectionSchema`/`cameraPresetSchema` already set for
 * "mirrors the TS interface field-for-field") so a preset can never carry
 * a value the destination project's own PATCH route would reject.
 */

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb hex color");

const solarAnchorSchema = z.object({
  id: z.string().min(1),
  timeHours: z.number().min(0).max(24),
  elevationDeg: z.number().min(-90).max(90),
  azimuthDeg: z.number().min(0).max(360),
});

const FIELD_GROUPS = [
  {
    id: "sun-sky",
    label: "Sun & Sky",
    fields: {
      sunAzimuthDeg: z.number().min(0).max(360),
      sunElevationDeg: z.number().min(-90).max(90),
      solarControllerEnabled: z.boolean(),
      solarPathMode: z.enum(["manual", "geographic"]),
      viewerTimeControlEnabled: z.boolean(),
      viewerTimeHours: z.number().min(0).max(24),
      viewerTimeStartHours: z.number().min(0).max(24),
      viewerTimeEndHours: z.number().min(0).max(24),
      viewerTimeStepMinutes: z.number().int().min(1).max(240),
      solarAnchors: z.array(solarAnchorSchema).max(24),
      geoLatitude: z.number().min(-90).max(90),
      geoLongitude: z.number().min(-180).max(180),
      // ISO date string, same client-side representation as
      // Project3DConfig.simulationDate — this is a JSON blob, not a Prisma
      // DateTime column, so no coercion is needed (or wanted: applying a
      // preset should hand the string straight to `configEditor.update`
      // unchanged, exactly like every other field here).
      simulationDate: z.string().min(1),
      northOffsetDeg: z.number().min(-360).max(360),
      sunDiscEnabled: z.boolean(),
      autoSunIntensityEnabled: z.boolean(),
      autoSunColorEnabled: z.boolean(),
      manualSunIntensity: z.number().min(0).max(10),
      manualSunColorHex: hexColorSchema,
      environmentRefreshEnabled: z.boolean(),
      skyEnabled: z.boolean(),
      skyTurbidity: z.number().min(0).max(20),
      skyRayleigh: z.number().min(0).max(4),
      skyMieCoefficient: z.number().min(0).max(0.1),
      skyMieDirectionalG: z.number().min(0).max(1),
      sunLightEnabled: z.boolean(),
      sunTemperatureK: z.number().int().min(1000).max(40000),
    },
  },
  {
    id: "fog-haze",
    label: "Fog & Haze",
    fields: {
      fogEnabled: z.boolean(),
      fogColor: hexColorSchema,
      fogDensity: z.number().min(0).max(0.1),
      fogMatchesSky: z.boolean(),
      fogHeightBandEnabled: z.boolean(),
      fogHazeEnabled: z.boolean(),
      fogNoiseEnabled: z.boolean(),
      fogMovementEnabled: z.boolean(),
      fogSunInteractionEnabled: z.boolean(),
      fogBaseHeight: z.number().min(-500).max(2000),
      fogTopHeight: z.number().min(-500).max(2000),
      fogHaze: z.number().min(0).max(1),
      fogNoiseStrength: z.number().min(0).max(1),
      fogNoiseScale: z.number().min(0.0001).max(1),
      fogWindDirectionDeg: z.number().min(0).max(360),
      fogWindSpeed: z.number().min(0).max(2),
      fogFalloff: z.number().min(0.01).max(8),
      fogMaxOpacity: z.number().min(0).max(1),
    },
  },
  {
    id: "clouds",
    label: "Clouds",
    fields: {
      cloudsEnabled: z.boolean(),
      cloudCoverage: z.number().min(0).max(1),
      cloudDensity: z.number().min(0).max(1),
      cloudElevation: z.number().min(0).max(1),
      cloudMovementEnabled: z.boolean(),
      cloudSunLightingEnabled: z.boolean(),
      cloudShadowsEnabled: z.boolean(),
      cloudHeight: z.number().min(0).max(2000),
      cloudThickness: z.number().min(1).max(1000),
      cloudThreshold: z.number().min(0).max(1),
      cloudOpacity: z.number().min(0).max(1),
      cloudSoftness: z.number().min(0.01).max(1),
      cloudScale: z.number().min(0.0001).max(1),
      cloudWindSpeed: z.number().min(0).max(2),
      cloudWindDirectionDeg: z.number().min(0).max(360),
      cloudRaymarchSteps: z.number().int().min(1).max(24),
    },
  },
  {
    id: "water",
    label: "Water",
    fields: {
      waterEnabled: z.boolean(),
      waterDistortionScale: z.number().min(0).max(8),
      waterSize: z.number().min(0.1).max(10),
      waterType: z.enum(["sea", "lake", "pool", "decorative"]),
      waterWavesEnabled: z.boolean(),
      waterMovementEnabled: z.boolean(),
      waterSunReflectionEnabled: z.boolean(),
      waterEnvReflectionEnabled: z.boolean(),
      waterNormalMapEnabled: z.boolean(),
      waterHeight: z.number().min(-500).max(500),
      waterColor: hexColorSchema,
      waterDeepColor: hexColorSchema,
    },
  },
  {
    id: "lens-flare-bloom",
    label: "Lens Flare & Bloom",
    fields: {
      lensFlareEnabled: z.boolean(),
      lensFlareIntensity: z.number().min(0).max(3),
      bloomEnabled: z.boolean(),
      bloomStrength: z.number().min(0).max(3),
      bloomRadius: z.number().min(0).max(1),
    },
  },
  {
    id: "color-grading",
    label: "Tone Mapping & Color",
    fields: {
      exposure: z.number().min(0).max(4),
      toneMapping: z.enum(["none", "linear", "reinhard", "cineon", "aces", "agx", "neutral"]),
      lutEnabled: z.boolean(),
      lutPreset: z.enum(LUT_PRESET_IDS),
      lutIntensity: z.number().min(0).max(1),
    },
  },
] as const;

/** UI-facing summary — which named groups exist and which field keys each
 * one covers, derived from `FIELD_GROUPS` so the Presets tab's "what's
 * included" list can never fall out of sync with the real validated shape. */
export const ENVIRONMENT_PRESET_FIELD_GROUPS = FIELD_GROUPS.map((g) => ({
  id: g.id,
  label: g.label,
  fieldNames: Object.keys(g.fields),
}));

export const environmentPresetConfigSchema = z.object(
  Object.assign({}, ...FIELD_GROUPS.map((g) => g.fields))
);

export type EnvironmentPresetConfig = z.infer<typeof environmentPresetConfigSchema>;

/** Extracts exactly the preset-scoped fields off a live `Project3DConfig`
 * draft (Save-as-Preset). Written out explicitly field-by-field rather than
 * looping over a key list — so adding a field to a `FIELD_GROUPS` entry
 * above without also adding it here is a real TS compile error (a missing
 * property on `EnvironmentPresetConfig`), not a silent gap. */
export function pickEnvironmentPresetConfig(draft: Project3DConfig): EnvironmentPresetConfig {
  return {
    sunAzimuthDeg: draft.sunAzimuthDeg,
    sunElevationDeg: draft.sunElevationDeg,
    solarControllerEnabled: draft.solarControllerEnabled,
    solarPathMode: draft.solarPathMode,
    viewerTimeControlEnabled: draft.viewerTimeControlEnabled,
    viewerTimeHours: draft.viewerTimeHours,
    viewerTimeStartHours: draft.viewerTimeStartHours,
    viewerTimeEndHours: draft.viewerTimeEndHours,
    viewerTimeStepMinutes: draft.viewerTimeStepMinutes,
    solarAnchors: draft.solarAnchors,
    geoLatitude: draft.geoLatitude,
    geoLongitude: draft.geoLongitude,
    simulationDate: draft.simulationDate,
    northOffsetDeg: draft.northOffsetDeg,
    sunDiscEnabled: draft.sunDiscEnabled,
    autoSunIntensityEnabled: draft.autoSunIntensityEnabled,
    autoSunColorEnabled: draft.autoSunColorEnabled,
    manualSunIntensity: draft.manualSunIntensity,
    manualSunColorHex: draft.manualSunColorHex,
    environmentRefreshEnabled: draft.environmentRefreshEnabled,
    skyEnabled: draft.skyEnabled,
    skyTurbidity: draft.skyTurbidity,
    skyRayleigh: draft.skyRayleigh,
    skyMieCoefficient: draft.skyMieCoefficient,
    skyMieDirectionalG: draft.skyMieDirectionalG,
    sunLightEnabled: draft.sunLightEnabled,
    sunTemperatureK: draft.sunTemperatureK,

    fogEnabled: draft.fogEnabled,
    fogColor: draft.fogColor,
    fogDensity: draft.fogDensity,
    fogMatchesSky: draft.fogMatchesSky,
    fogHeightBandEnabled: draft.fogHeightBandEnabled,
    fogHazeEnabled: draft.fogHazeEnabled,
    fogNoiseEnabled: draft.fogNoiseEnabled,
    fogMovementEnabled: draft.fogMovementEnabled,
    fogSunInteractionEnabled: draft.fogSunInteractionEnabled,
    fogBaseHeight: draft.fogBaseHeight,
    fogTopHeight: draft.fogTopHeight,
    fogHaze: draft.fogHaze,
    fogNoiseStrength: draft.fogNoiseStrength,
    fogNoiseScale: draft.fogNoiseScale,
    fogWindDirectionDeg: draft.fogWindDirectionDeg,
    fogWindSpeed: draft.fogWindSpeed,
    fogFalloff: draft.fogFalloff,
    fogMaxOpacity: draft.fogMaxOpacity,

    cloudsEnabled: draft.cloudsEnabled,
    cloudCoverage: draft.cloudCoverage,
    cloudDensity: draft.cloudDensity,
    cloudElevation: draft.cloudElevation,
    cloudMovementEnabled: draft.cloudMovementEnabled,
    cloudSunLightingEnabled: draft.cloudSunLightingEnabled,
    cloudShadowsEnabled: draft.cloudShadowsEnabled,
    cloudHeight: draft.cloudHeight,
    cloudThickness: draft.cloudThickness,
    cloudThreshold: draft.cloudThreshold,
    cloudOpacity: draft.cloudOpacity,
    cloudSoftness: draft.cloudSoftness,
    cloudScale: draft.cloudScale,
    cloudWindSpeed: draft.cloudWindSpeed,
    cloudWindDirectionDeg: draft.cloudWindDirectionDeg,
    cloudRaymarchSteps: draft.cloudRaymarchSteps,

    waterEnabled: draft.waterEnabled,
    waterDistortionScale: draft.waterDistortionScale,
    waterSize: draft.waterSize,
    waterType: draft.waterType,
    waterWavesEnabled: draft.waterWavesEnabled,
    waterMovementEnabled: draft.waterMovementEnabled,
    waterSunReflectionEnabled: draft.waterSunReflectionEnabled,
    waterEnvReflectionEnabled: draft.waterEnvReflectionEnabled,
    waterNormalMapEnabled: draft.waterNormalMapEnabled,
    waterHeight: draft.waterHeight,
    waterColor: draft.waterColor,
    waterDeepColor: draft.waterDeepColor,

    lensFlareEnabled: draft.lensFlareEnabled,
    lensFlareIntensity: draft.lensFlareIntensity,
    bloomEnabled: draft.bloomEnabled,
    bloomStrength: draft.bloomStrength,
    bloomRadius: draft.bloomRadius,

    exposure: draft.exposure,
    toneMapping: draft.toneMapping,
    lutEnabled: draft.lutEnabled,
    // Project3DConfig.lutPreset is a free `string` client-side (validated
    // against LUT_PRESET_IDS only at the zod layer, same "free string key,
    // not a DB enum" convention /api/project-3d-config's own patchSchema
    // already uses) — this cast is that same convention, not a real type
    // hole: environmentPresetConfigSchema.parse() re-validates it for real
    // on every save.
    lutPreset: draft.lutPreset as EnvironmentPresetConfig["lutPreset"],
    lutIntensity: draft.lutIntensity,
  };
}
