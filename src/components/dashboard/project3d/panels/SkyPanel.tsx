"use client";

import type { Project3DConfig } from "@/lib/types";
import { SliderField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

/**
 * Sky mode panel (webgl_shaders_sky.html parity, added 2026-08-14 as a
 * standalone tab alongside — not instead of — the existing "Ocean" tab).
 * Shows exactly the reference demo's own GUI:
 *   - elevation, azimuth, exposure
 *   - turbidity, rayleigh, mieCoefficient, mieDirectionalG
 *
 * Elevation/azimuth/exposure are `sunElevationDeg`/`sunAzimuthDeg`/
 * `exposure` — the same real fields the Ocean tab's own Sky section
 * already reads/writes (same physical sun, same shared underlying
 * config), reused here rather than duplicated as separate columns, since
 * both reference demos expose the same three physical params under the
 * same names. Turbidity/rayleigh/mieCoefficient/mieDirectionalG were
 * previously one fixed constant applied to every project
 * (viewerPresets.ts's now-removed `SKY_PHYSICAL_PARAMS`) — real
 * per-project fields now, defaulted to that exact prior tuple.
 *
 * `skyEnabled` is a Rozaris-specific addition — the reference demo has no
 * off switch (its Sky is always the scene) — added per explicit user
 * request ("possibility to turn off"). Disabling falls back to a flat
 * neutral background/environment instead of the physical dome (see
 * RenderEngine.ts's rebuildEnvironment); it does not affect Water/Bloom/
 * Clouds on the Ocean tab, which read the same sun direction regardless.
 */
export function SkyPanel({
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
        <ToggleField
          label={t("admin.skyEnabled")}
          checked={draft.skyEnabled}
          onChange={(v) => update({ skyEnabled: v }, { commit: true })}
        />
        <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.skyEnabledNote")}</p>
      </section>

      {draft.skyEnabled && (
        <>
          <section className="border-t border-neutral-100 pt-4">
            <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
              {t("admin.skySunTitle")}
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
              {t("admin.skyAtmosphereTitle")}
            </h3>
            <div className="space-y-3">
              <SliderField
                label={t("admin.skyTurbidity")}
                min={0}
                max={20}
                step={0.1}
                value={draft.skyTurbidity}
                onChange={(v) => update({ skyTurbidity: v })}
              />
              <SliderField
                label={t("admin.skyRayleigh")}
                min={0}
                max={4}
                step={0.001}
                value={draft.skyRayleigh}
                onChange={(v) => update({ skyRayleigh: v })}
              />
              <SliderField
                label={t("admin.skyMieCoefficient")}
                min={0}
                max={0.1}
                step={0.001}
                value={draft.skyMieCoefficient}
                onChange={(v) => update({ skyMieCoefficient: v })}
              />
              <SliderField
                label={t("admin.skyMieDirectionalG")}
                min={0}
                max={1}
                step={0.001}
                value={draft.skyMieDirectionalG}
                onChange={(v) => update({ skyMieDirectionalG: v })}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.skyAtmosphereNote")}</p>
          </section>
        </>
      )}
    </div>
  );
}
