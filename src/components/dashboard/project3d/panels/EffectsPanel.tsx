"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLASS_TIERS, LUT_PRESETS, QUALITY_TIERS } from "@/lib/viewerPresets";
import type { Project3DConfig } from "@/lib/types";
import { ColorField, SelectField, SliderField, TextField, ToggleField } from "../fields";
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
  perfStats,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  suggestedTier: Project3DConfig["qualityPreset"];
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** The same 4 real fields the viewport's perf overlay tracks (fps/
   * drawCalls/triangles/dpr — RenderEngine.ts's samplePerfStats), mirrored
   * up by EditorShell via ProceduralProjectViewer's new `onPerfStats` prop
   * (dark-theme configurator restyle) so they can render here instead of
   * only as a floating canvas overlay. `null` until the viewer's first
   * sample (~30 frames after mount). */
  perfStats: { fps: number; drawCalls: number; triangles: number; dpr: number } | null;
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
          {/* Quality preset itself moved to the global bottom status bar
              (Inventory/Floors mockup pass) — one editable location for the
              field instead of two live selects at once; this note still
              reads the same live value/suggestion. */}
          <p className="text-[11px] text-neutral-400">
            {t("admin.sceneQualitySuggested", { tier: t(`admin.sceneQuality_${suggestedTier}`) })}
          </p>
        </div>
      </section>

      {/* --- Performance Overview (dark-theme configurator restyle) — the
          4 real stats already tracked by RenderEngine.ts's
          samplePerfStats, now shown here instead of only as a floating
          canvas-corner overlay. No Frame Time/GPU Memory/Textures cards:
          not real data this app tracks today, not fabricated to match the
          reference mockup's fuller grid. --- */}
      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.scenePerformanceOverviewTitle")}
        </h3>
        {perfStats ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-control border border-neutral-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">FPS</p>
              <p className="font-numeric text-lg font-bold text-neutral-900">{perfStats.fps}</p>
            </div>
            <div className="rounded-control border border-neutral-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">DPR</p>
              <p className="font-numeric text-lg font-bold text-neutral-900">{perfStats.dpr.toFixed(2)}×</p>
            </div>
            <div className="rounded-control border border-neutral-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                {t("admin.perfDrawCalls")}
              </p>
              <p className="font-numeric text-lg font-bold text-neutral-900">{perfStats.drawCalls}</p>
            </div>
            <div className="rounded-control border border-neutral-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">
                {t("admin.perfTriangles")}
              </p>
              <p className="font-numeric text-lg font-bold text-neutral-900">
                {perfStats.triangles.toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-neutral-400">{t("admin.scenePerformanceOverviewLoading")}</p>
        )}
      </section>

      {/* --- Performance (full-configurator pass). Shadows/Antialiasing
          are real, working toggles. Reflections(SSR)/AO(GTAO) used to be
          here too — removed entirely (2026-08-13, user request), not just
          hidden: that TSL chain caused two unexplained real-GPU rendering
          failures earlier this session and was implicated in a later
          real Sections-panel instability report, so it, its schema
          fields, and its MRT/HDR-clamp scaffolding were all taken out of
          RenderEngine.ts rather than kept as a dead toggle — see
          viewerPresets.ts's QUALITY_TIERS header comment for the full
          history. SSGI is intentionally not exposed at all — already
          permanently `false` project-wide, deferred (needs a temporal
          denoiser, judged too risky to wire blind). --- */}
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
          {/* webgl_watch.html parity — real PCF soft-shadow-edge slider,
              only meaningful while shadows themselves are on. */}
          {draft.shadowsEnabled && (
            <SliderField
              label={t("admin.performanceShadowSoftness")}
              min={0}
              max={10}
              step={0.5}
              value={draft.shadowSoftness}
              onChange={(v) => update({ shadowSoftness: v })}
            />
          )}
          <ToggleField
            label={t("admin.performanceAntialiasing")}
            checked={draft.antialiasEnabled}
            onChange={(v) => update({ antialiasEnabled: v }, { commit: true })}
          />
          <div>
            <ToggleField
              label={t("admin.performanceSectionCapStencil")}
              checked={draft.sectionCapStencilEnabled}
              onChange={(v) => update({ sectionCapStencilEnabled: v }, { commit: true })}
            />
            <p className="mt-1 text-[11px] text-neutral-400">{t("admin.performanceSectionCapStencilNote")}</p>
          </div>
        </div>
      </section>

      {/* --- Environment — real PMREM reflection-strength control, moved
          here from the old Lighting tab's "Sky" sub-tab (removed entirely
          2026-08-14, see modes.ts's own doc comment) since it isn't part
          of the Sky/Water/Bloom/Clouds "Ocean" tab's own reference-demo
          GUI. --- */}
      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sceneEnvironmentTitle")}
        </h3>
        <SliderField
          label={t("admin.sceneEnvironmentIntensity")}
          min={0}
          max={3}
          step={0.05}
          value={draft.environmentIntensity}
          onChange={(v) => update({ environmentIntensity: v })}
          suffix="×"
        />
      </section>

      {/* --- Ground Platform — moved here from the old Lighting tab's
          "Environment" sub-tab (removed entirely 2026-08-14), unchanged
          otherwise: real ground mesh/color + a separate radial "ground
          fog" fade around world origin. --- */}
      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sceneGroundTitle")}
        </h3>
        <ToggleField
          label={t("admin.viewer3DGround")}
          checked={draft.groundEnabled}
          onChange={(v) => update({ groundEnabled: v }, { commit: true })}
        />
        {draft.groundEnabled && (
          <div className="mt-3 space-y-3">
            <SelectField
              label={t("admin.sceneGroundStyle")}
              value={draft.groundStyle}
              onChange={(v) => update({ groundStyle: v as Project3DConfig["groundStyle"] }, { commit: true })}
              options={[
                ["disc", t("admin.sceneGroundStyleDisc")],
                ["infinite", t("admin.sceneGroundStyleInfinite")],
              ]}
            />
            <p className="text-[11px] text-neutral-400">{t("admin.sceneGroundStyleNote")}</p>
            <ColorField
              label={t("admin.sceneGroundColor")}
              value={draft.groundColor}
              onChange={(v) => update({ groundColor: v }, { commit: true })}
            />
            <div className="rounded-control border border-neutral-100 p-2.5">
              <ToggleField
                label={t("admin.sceneGroundFogEnabled")}
                checked={draft.groundFogEnabled}
                onChange={(v) => update({ groundFogEnabled: v }, { commit: true })}
              />
              {draft.groundFogEnabled && (
                <div className="mt-3 space-y-1.5">
                  <TextField
                    label={t("admin.sceneGroundFogRadius")}
                    value={String(draft.groundFogRadius)}
                    onChange={(v) => {
                      const n = Number(v);
                      if (Number.isFinite(n) && n > 0) update({ groundFogRadius: n });
                    }}
                    placeholder="300"
                  />
                  <p className="text-[11px] text-neutral-400">{t("admin.sceneGroundFogNote")}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* --- Fog — moved here from the old Lighting tab's "Environment"
          sub-tab (removed entirely 2026-08-14), unchanged otherwise: real
          camera-relative THREE.FogExp2. --- */}
      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sceneFogEnabled")}
        </h3>
        <ToggleField
          label={t("admin.sceneFogEnabled")}
          checked={draft.fogEnabled}
          onChange={(v) => update({ fogEnabled: v }, { commit: true })}
        />
        {draft.fogEnabled && (
          <div className="mt-3 space-y-3">
            <ToggleField
              label={t("admin.sceneFogMatchesSky")}
              checked={draft.fogMatchesSky}
              onChange={(v) => update({ fogMatchesSky: v }, { commit: true })}
            />
            {draft.fogMatchesSky ? (
              <p className="text-[11px] text-neutral-400">{t("admin.sceneFogMatchesSkyNote")}</p>
            ) : (
              <ColorField
                label={t("admin.sceneFogColor")}
                value={draft.fogColor}
                onChange={(v) => update({ fogColor: v }, { commit: true })}
              />
            )}
            <SliderField
              label={t("admin.sceneFogDensity")}
              min={0}
              max={0.05}
              step={0.001}
              value={draft.fogDensity}
              onChange={(v) => update({ fogDensity: v })}
            />
          </div>
        )}
      </section>

      {/* --- Bloom (webgl_postprocessing_unreal_bloom.html parity) — the
          exact same `Project3DConfig.bloomEnabled/Strength/Radius` fields
          the Sky/Water/Bloom/Clouds "Ocean" tab's own Bloom group
          controls, surfaced there instead now (2026-08-14) — no longer
          duplicated here, matching the reference demo's own single Bloom
          GUI folder. `threshold` was a real per-project slider here too
          until this pass; fixed back to `webgl_shaders_ocean.html`'s own
          hardcoded default (see BLOOM_THRESHOLD_DEFAULT in
          RenderEngine.ts). --- */}

      {/* --- 3D LUT color grading (webgl_postprocessing_3dlut.html parity)
          — every option the reference demo's own GUI exposes: enabled, a
          9-way preset dropdown, intensity. Moved here from the old
          Lighting tab's "Effects" sub-tab (removed entirely 2026-08-14) —
          not part of the Sky/Water/Bloom/Clouds "Ocean" tab's own
          reference-demo GUI, but explicitly kept and expanded to the full
          preset list per user request. --- */}
      <section className="border-t border-neutral-100 pt-4">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sceneLutEnabled")}
        </h3>
        <ToggleField
          label={t("admin.sceneLutEnabled")}
          checked={draft.lutEnabled}
          onChange={(v) => update({ lutEnabled: v }, { commit: true })}
        />
        {draft.lutEnabled && (
          <div className="mt-3 space-y-3">
            <SelectField
              label={t("admin.sceneLutPreset")}
              value={draft.lutPreset}
              onChange={(v) => update({ lutPreset: v }, { commit: true })}
              options={LUT_PRESETS.map((p) => [p.id, p.label] as [string, string])}
            />
            <SliderField
              label={t("admin.sceneLutIntensity")}
              min={0}
              max={1}
              step={0.01}
              value={draft.lutIntensity}
              onChange={(v) => update({ lutIntensity: v })}
            />
            <p className="text-[11px] text-neutral-400">{t("admin.sceneLutNote")}</p>
          </div>
        )}
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
