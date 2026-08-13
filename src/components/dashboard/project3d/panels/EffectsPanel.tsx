"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLASS_TIERS, QUALITY_PRESET_ORDER, QUALITY_TIERS } from "@/lib/viewerPresets";
import type { Project3DConfig } from "@/lib/types";
import { SelectField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

/**
 * Effects mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * "Rendering & Quality" (663-690) and "Advanced Settings" (1049-1087)
 * sections. Glass tier's own select stays in MaterialsPanel; this panel
 * only reads `draft.glassPreset` for the read-only Advanced Settings
 * display, unchanged from the original (glass numbers were always shown
 * next to rendering numbers there, even though the Glass select itself
 * lived in a separate section above it).
 */
export function EffectsPanel({
  draft,
  update,
  suggestedTier,
  advancedOpen,
  setAdvancedOpen,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  suggestedTier: Project3DConfig["qualityPreset"];
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  t: Translate;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sceneRenderingTitle")}
        </h3>
        <div className="space-y-3">
          <SelectField
            label={t("admin.sceneRenderingMode")}
            value={draft.renderingMode}
            onChange={(v) => update({ renderingMode: v as Project3DConfig["renderingMode"] }, { commit: true })}
            options={[
              ["auto", t("admin.sceneRenderingModeAuto")],
              ["webgpu", t("admin.sceneRenderingModeWebgpu")],
              ["webgl2", t("admin.sceneRenderingModeWebgl2")],
            ]}
          />
          <SelectField
            label={t("admin.sceneQualityPreset")}
            value={draft.qualityPreset}
            onChange={(v) => update({ qualityPreset: v as Project3DConfig["qualityPreset"] }, { commit: true })}
            options={QUALITY_PRESET_ORDER.map((id): [string, string] => [id, t(`admin.sceneQuality_${id}`)])}
          />
          <p className="text-[11px] text-neutral-400">
            {t("admin.sceneQualitySuggested", { tier: t(`admin.sceneQuality_${suggestedTier}`) })}
          </p>
        </div>
      </section>

      {/* --- Performance (full-configurator pass). Shadows/Antialiasing
          are real, working toggles. Reflections(SSR)/AO(GTAO) are real,
          schema-backed fields too, but currently inert platform-wide —
          every QUALITY_TIERS entry force-disables the underlying effect
          (see that file's header comment: two unexplained real-GPU
          rendering failures in this exact chain) — RenderEngine.ts's
          buildRenderPipeline ANDs this toggle with the tier's own flag, so
          flipping it here can't reintroduce the crash. SSGI is
          intentionally not exposed at all — already permanently `false`
          project-wide, deferred (needs a temporal denoiser, judged too
          risky to wire blind). --- */}
      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.scenePerformanceTitle")}
        </h3>
        <div className="space-y-3">
          <ToggleField
            label={t("admin.performanceShadows")}
            checked={draft.shadowsEnabled}
            onChange={(v) => update({ shadowsEnabled: v }, { commit: true })}
          />
          <div>
            <ToggleField
              label={t("admin.performanceReflections")}
              checked={draft.ssrEnabled}
              onChange={(v) => update({ ssrEnabled: v }, { commit: true })}
            />
            <p className="mt-1 text-[11px] text-neutral-400">{t("admin.performanceInertNote")}</p>
          </div>
          <div>
            <ToggleField
              label={t("admin.performanceAO")}
              checked={draft.gtaoEnabled}
              onChange={(v) => update({ gtaoEnabled: v }, { commit: true })}
            />
            <p className="mt-1 text-[11px] text-neutral-400">{t("admin.performanceInertNote")}</p>
          </div>
          <ToggleField
            label={t("admin.performanceAntialiasing")}
            checked={draft.antialiasEnabled}
            onChange={(v) => update({ antialiasEnabled: v }, { commit: true })}
          />
        </div>
      </section>

      {/* --- Advanced Settings — read-only: every number below comes from
          the selected preset tier (src/lib/viewerPresets.ts), not an
          independent per-project override yet. Shown so Admin can see what
          a preset actually does, not as fake controls. --- */}
      <section className="border-t border-neutral-100 pt-4">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-500"
        >
          <span>{t("admin.sceneAdvancedTitle")}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
        </button>
        {advancedOpen && (
          <div className="mt-3 space-y-3 rounded-panel border border-neutral-100 bg-neutral-50 p-3 text-xs text-neutral-600">
            <div>
              <p className="font-semibold text-neutral-700">{t("admin.sceneAdvancedRendering")}</p>
              <p>
                {t("admin.sceneAdvancedRenderScale", {
                  value: Math.round(QUALITY_TIERS[draft.qualityPreset].renderScale * 100),
                })}{" "}
                · {t("admin.sceneAdvancedDprCap", { value: QUALITY_TIERS[draft.qualityPreset].dprCap })} ·{" "}
                {t("admin.sceneAdvancedShadowRes", { value: QUALITY_TIERS[draft.qualityPreset].shadowMapSize })}
              </p>
            </div>
            <div>
              <p className="font-semibold text-neutral-700">{t("admin.sceneAdvancedGlass")}</p>
              <p>
                {t("admin.sceneAdvancedTransmission", { value: GLASS_TIERS[draft.glassPreset].transmission })} ·{" "}
                {t("admin.sceneAdvancedRoughness", { value: GLASS_TIERS[draft.glassPreset].roughness })} ·{" "}
                {t("admin.sceneAdvancedIor", { value: GLASS_TIERS[draft.glassPreset].ior })}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
