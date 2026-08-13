"use client";

import { Trash2, Upload } from "lucide-react";
import { useState, type RefObject } from "react";
import type { PlatformHdri, Project3DConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ColorField, DateField, SelectField, SliderField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

function formatUTCHour(h: number): string {
  const hour = Math.floor(h) % 24;
  const minutes = Math.round((h - Math.floor(h)) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")} UTC`;
}

type LightingSubTab = "sunTime" | "sky" | "environment" | "effects" | "exposure";

const SUB_TABS: { id: LightingSubTab; labelKey: string }[] = [
  { id: "sunTime", labelKey: "admin.lightingSubTabSunTime" },
  { id: "sky", labelKey: "admin.lightingSubTabSky" },
  { id: "environment", labelKey: "admin.lightingSubTabEnvironment" },
  { id: "effects", labelKey: "admin.lightingSubTabEffects" },
  { id: "exposure", labelKey: "admin.lightingSubTabExposure" },
];

/**
 * Lighting mode panel — originally moved verbatim from
 * Project3DConfigEditor.tsx's "Lighting & Sun" section (693-866); restructured
 * (2026-08-13, "Sun & Time" pass) into 5 sub-tabs so the tab reads as one
 * coherent environment configurator instead of one long scroll — no new
 * top-level `EditorShell` tab, this is entirely internal to the panel (see
 * that pass's plan doc for the full rationale). Sub-tab selection is local
 * UI state, not threaded through undo/redo (matches `selectedFloor`/
 * `gizmoMode`-style local state elsewhere in this editor).
 *
 * Every field below maps to a real, already-wired `Project3DConfig` field
 * except `simulationDate` (new this pass) — no invented/decorative
 * controls. `northRotationDeg` moved here from the old flat "Environment"
 * heading into Sun & Time, since True North is part of the same geographic
 * sun system, not a generic environment setting. `lensflareEnabled` moved
 * from the old "Sun" box into the new Effects sub-tab, alongside
 * `lightProbeEnabled` — both are optional visual add-ons layered on top of
 * the sun/sky, not core sun state.
 */
export function LightingPanel({
  draft,
  update,
  platformHdris,
  hdriBusy,
  hdriError,
  hdriFileInputRef,
  onHdriUpload,
  onDeleteHdri,
  sunTimes,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  platformHdris: PlatformHdri[];
  hdriBusy: boolean;
  hdriError: string | null;
  hdriFileInputRef: RefObject<HTMLInputElement | null>;
  onHdriUpload: (file: File) => void;
  onDeleteHdri: (hdri: PlatformHdri) => void;
  sunTimes: { sunriseHourUTC: number; sunsetHourUTC: number } | null;
  t: Translate;
}) {
  const [subTab, setSubTab] = useState<LightingSubTab>("sunTime");

  return (
    <section>
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.sceneLightingTitle")}
      </h3>

      {/* Sub-tab pill strip — same visual convention as SlotTabStrip.tsx's
          slot pills, minus the rename/add/delete affordances (this is
          pure navigation, not a list of editable entities). The panel
          column is only lg:w-1/4, so a horizontal strip fits better than
          a vertical rail. */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-xs font-semibold",
              subTab === tab.id
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-neutral-200 text-neutral-600 hover:text-neutral-900"
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {subTab === "sunTime" && (
          <>
            <div className="rounded-panel border border-neutral-100 p-3">
              <SelectField
                label={t("admin.sunModeTitle")}
                value={draft.sunMode}
                onChange={(v) => update({ sunMode: v as Project3DConfig["sunMode"] }, { commit: true })}
                options={[
                  ["geographic", t("admin.sunModeGeographic")],
                  ["manual", t("admin.sunModeManual")],
                ]}
              />
              {/* Intensity applies under both modes — geographic mode used
                  to ignore it entirely (see RenderEngine.ts's
                  applySunAndEnvironment). */}
              <div className="mt-3">
                <SliderField
                  label={t("admin.sunIntensity")}
                  min={0}
                  max={3}
                  step={0.05}
                  value={draft.sunIntensity}
                  onChange={(v) => update({ sunIntensity: v })}
                  suffix="×"
                />
              </div>
              {draft.sunMode === "manual" && (
                <div className="mt-3 space-y-3">
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
                    label={t("admin.sunElevation")}
                    min={-90}
                    max={90}
                    step={1}
                    value={draft.sunElevationDeg}
                    onChange={(v) => update({ sunElevationDeg: v })}
                    suffix="°"
                  />
                </div>
              )}
            </div>

            <DateField
              label={t("admin.sunSimulationDate")}
              value={draft.simulationDate}
              onChange={(v) => update({ simulationDate: v }, { commit: true })}
              liveLabel={t("admin.sunSimulationDateLive")}
              resetLabel={t("admin.sunSimulationDateReset")}
            />
            <p className="text-[11px] text-neutral-400">{t("admin.sunSimulationDateNote")}</p>

            <SliderField
              label={t("admin.sceneDefaultTime")}
              min={0}
              max={24}
              step={0.5}
              value={draft.defaultTimeOfDay}
              onChange={(v) => update({ defaultTimeOfDay: v })}
            />
            <ToggleField
              label={t("admin.sceneAllowUserTime")}
              checked={draft.allowUserTimeChange}
              onChange={(v) => update({ allowUserTimeChange: v }, { commit: true })}
            />
            {sunTimes && (
              <p className="text-[11px] text-neutral-400">
                {t("admin.sceneSunTimes", {
                  sunrise: formatUTCHour(sunTimes.sunriseHourUTC),
                  sunset: formatUTCHour(sunTimes.sunsetHourUTC),
                })}
              </p>
            )}

            <SliderField
              label={t("admin.sceneNorthRotation")}
              min={-180}
              max={180}
              step={1}
              value={draft.northRotationDeg}
              onChange={(v) => update({ northRotationDeg: v })}
              suffix="°"
            />
          </>
        )}

        {subTab === "sky" && (
          <>
            <SelectField
              label={t("admin.sceneSkyPreset")}
              value={draft.skyPreset}
              onChange={(v) => update({ skyPreset: v as Project3DConfig["skyPreset"] }, { commit: true })}
              options={[
                ["clear_day", t("admin.sceneSkyClearDay")],
                ["soft_day", t("admin.sceneSkySoftDay")],
                ["overcast", t("admin.sceneSkyOvercast")],
                ["golden_hour", t("admin.sceneSkyGoldenHour")],
                ["evening", t("admin.sceneSkyEvening")],
              ]}
            />
            <SelectField
              label={t("admin.sceneBackgroundPreset")}
              value={draft.backgroundPreset}
              onChange={(v) => update({ backgroundPreset: v as Project3DConfig["backgroundPreset"] }, { commit: true })}
              options={[
                ["sky", t("admin.sceneBackgroundSky")],
                ["studio_light", t("admin.sceneBackgroundStudioLight")],
                ["studio_dark", t("admin.sceneBackgroundStudioDark")],
              ]}
            />
            <p className="text-[11px] text-neutral-400">{t("admin.sceneBackgroundNote")}</p>
            <SliderField
              label={t("admin.sceneEnvironmentIntensity")}
              min={0}
              max={3}
              step={0.05}
              value={draft.environmentIntensity}
              onChange={(v) => update({ environmentIntensity: v })}
              suffix="×"
            />
          </>
        )}

        {subTab === "environment" && (
          <>
            <ToggleField
              label={t("admin.viewer3DGround")}
              checked={draft.groundEnabled}
              onChange={(v) => update({ groundEnabled: v }, { commit: true })}
            />

            {/* --- Fog (full-configurator pass) --- */}
            <div className="rounded-panel border border-neutral-100 p-3">
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
            </div>

            {/* --- Platform HDRI (Task 2 — Track A) --- */}
            <div className="rounded-panel border border-neutral-100 p-3">
              <SelectField
                label={t("admin.hdriTitle")}
                value={draft.hdriId ?? ""}
                onChange={(v) => update({ hdriId: v || null }, { commit: true })}
                options={[["", t("admin.hdriOff")], ...platformHdris.map((h): [string, string] => [h.id, h.name])]}
              />
              <p className="mt-1 text-[11px] text-neutral-400">{t("admin.hdriNote")}</p>
              {platformHdris.length > 0 && (
                <div className="mt-2 space-y-1">
                  {platformHdris.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate text-neutral-600">{h.name}</span>
                      <button
                        onClick={() => onDeleteHdri(h)}
                        disabled={hdriBusy}
                        aria-label={t("common.close")}
                        className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={hdriFileInputRef}
                type="file"
                accept=".hdr,.exr"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onHdriUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => hdriFileInputRef.current?.click()}
                disabled={hdriBusy}
                className="mt-2 flex items-center gap-1.5 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                {t("admin.hdriUpload")}
              </button>
              {hdriError && <p className="mt-1.5 text-[11px] text-red-500">{hdriError}</p>}
            </div>
          </>
        )}

        {subTab === "effects" && (
          <>
            <ToggleField
              label={t("admin.sceneLightProbeEnabled")}
              checked={draft.lightProbeEnabled}
              onChange={(v) => update({ lightProbeEnabled: v }, { commit: true })}
            />
            <ToggleField
              label={t("admin.sunLensflare")}
              checked={draft.lensflareEnabled}
              onChange={(v) => update({ lensflareEnabled: v }, { commit: true })}
            />
          </>
        )}

        {subTab === "exposure" && (
          <SliderField
            label={t("admin.sceneExposure")}
            min={0}
            max={3}
            step={0.05}
            value={draft.exposure}
            onChange={(v) => update({ exposure: v })}
            suffix="×"
          />
        )}
      </div>
    </section>
  );
}
