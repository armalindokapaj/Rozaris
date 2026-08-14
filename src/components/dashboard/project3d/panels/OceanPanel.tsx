"use client";

import type { Project3DConfig } from "@/lib/types";
import { SliderField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

/**
 * Ocean mode panel (webgl_shaders_ocean.html parity) — replaces the old
 * "Lighting" tab entirely (2026-08-14, explicit user request: "these
 * options on a separate tab... shown exactly these options such as in the
 * example... turn off everything else"). Shows exactly the reference
 * demo's own GUI, nothing more:
 *   - Sky: elevation, azimuth, exposure
 *   - Water: distortionScale, size
 *   - Bloom: strength, radius
 *   - Clouds: coverage, density, elevation
 *
 * Every field here maps to a real, already-wired `Project3DConfig` field
 * — Sky's elevation/azimuth are `sunElevationDeg`/`sunAzimuthDeg` (the
 * real sun position, now the *only* sun model — no more geographic date/
 * time simulation), exposure is the shared `renderer.toneMappingExposure`
 * field, Water/Bloom/Clouds are unchanged from the earlier Sky/Water/
 * Bloom/Clouds pass. Sky itself has no enable toggle (the physical sky
 * dome is always the scene's backdrop now); Water/Bloom/Clouds keep their
 * real per-project opt-in toggles since not every project is waterfront/
 * wants bloom/clouds, matching this app's existing "off by default"
 * discipline even though the reference demo's own GUI doesn't gate them.
 *
 * Everything else the old Lighting tab held — geographic sun/date/time
 * simulation, Platform HDRI, sky/background presets, lens flare, light
 * probe, motion blur — was removed entirely, not hidden (see
 * Project3DConfig's own doc comment). Ground/Fog/Environment Intensity
 * moved to the Effects tab (not part of this demo's own GUI); LUT stayed
 * on Effects too.
 */
export function OceanPanel({
  draft,
  update,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  t: Translate;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.oceanSkyTitle")}
        </h3>
        <div className="space-y-3">
          <SliderField
            label={t("admin.sunElevation")}
            min={-90}
            max={90}
            step={1}
            value={draft.sunElevationDeg}
            onChange={(v) => update({ sunElevationDeg: v })}
            suffix="°"
          />
          <SliderField
            label={t("admin.sunAzimuth")}
            min={0}
            max={360}
            step={1}
            value={draft.sunAzimuthDeg}
            onChange={(v) => update({ sunAzimuthDeg: v })}
            suffix="°"
          />
          <SliderField
            label={t("admin.sceneExposure")}
            min={0}
            max={3}
            step={0.05}
            value={draft.exposure}
            onChange={(v) => update({ exposure: v })}
            suffix="×"
          />
        </div>
      </section>

      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.oceanWaterTitle")}
        </h3>
        <ToggleField
          label={t("admin.sceneWaterEnabled")}
          checked={draft.waterEnabled}
          onChange={(v) => update({ waterEnabled: v }, { commit: true })}
        />
        {draft.waterEnabled && (
          <div className="mt-3 space-y-3">
            <SliderField
              label={t("admin.sceneWaterDistortionScale")}
              min={0}
              max={8}
              step={0.1}
              value={draft.waterDistortionScale}
              onChange={(v) => update({ waterDistortionScale: v })}
            />
            <SliderField
              label={t("admin.sceneWaterSize")}
              min={0.1}
              max={10}
              step={0.1}
              value={draft.waterSize}
              onChange={(v) => update({ waterSize: v })}
            />
            <p className="text-[11px] text-neutral-400">{t("admin.sceneWaterNote")}</p>
          </div>
        )}
      </section>

      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.oceanBloomTitle")}
        </h3>
        <ToggleField
          label={t("admin.sceneBloomEnabled")}
          checked={draft.bloomEnabled}
          onChange={(v) => update({ bloomEnabled: v }, { commit: true })}
        />
        {draft.bloomEnabled && (
          <div className="mt-3 space-y-3">
            <SliderField
              label={t("admin.sceneBloomStrength")}
              min={0}
              max={3}
              step={0.01}
              value={draft.bloomStrength}
              onChange={(v) => update({ bloomStrength: v })}
            />
            <SliderField
              label={t("admin.sceneBloomRadius")}
              min={0}
              max={1}
              step={0.01}
              value={draft.bloomRadius}
              onChange={(v) => update({ bloomRadius: v })}
            />
            <p className="text-[11px] text-neutral-400">{t("admin.sceneBloomNote")}</p>
          </div>
        )}
      </section>

      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.oceanCloudsTitle")}
        </h3>
        <ToggleField
          label={t("admin.sceneCloudsEnabled")}
          checked={draft.cloudsEnabled}
          onChange={(v) => update({ cloudsEnabled: v }, { commit: true })}
        />
        {draft.cloudsEnabled && (
          <div className="mt-3 space-y-3">
            <SliderField
              label={t("admin.sceneCloudCoverage")}
              min={0}
              max={1}
              step={0.01}
              value={draft.cloudCoverage}
              onChange={(v) => update({ cloudCoverage: v })}
            />
            <SliderField
              label={t("admin.sceneCloudDensity")}
              min={0}
              max={1}
              step={0.01}
              value={draft.cloudDensity}
              onChange={(v) => update({ cloudDensity: v })}
            />
            <SliderField
              label={t("admin.sceneCloudElevation")}
              min={0}
              max={1}
              step={0.01}
              value={draft.cloudElevation}
              onChange={(v) => update({ cloudElevation: v })}
            />
          </div>
        )}
      </section>
    </div>
  );
}
