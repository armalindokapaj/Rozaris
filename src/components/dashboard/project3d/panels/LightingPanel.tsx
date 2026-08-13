"use client";

import { Trash2, Upload } from "lucide-react";
import type { RefObject } from "react";
import type { PlatformHdri, Project3DConfig } from "@/lib/types";
import { ColorField, SelectField, SliderField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";

function formatUTCHour(h: number): string {
  const hour = Math.floor(h) % 24;
  const minutes = Math.round((h - Math.floor(h)) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")} UTC`;
}

/**
 * Lighting mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * "Lighting & Sun" section (693-866): sky/background presets, the
 * Platform HDRI sub-panel (its own immediate upload/delete, not gated by
 * the big Save), environment sliders, and the manual sun sub-panel.
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
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
        {t("admin.sceneLightingTitle")}
      </h3>
      <div className="space-y-3">
        <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          {t("admin.sceneEnvironmentTitle")}
        </h4>
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

        <SliderField
          label={t("admin.sceneEnvironmentIntensity")}
          min={0}
          max={3}
          step={0.05}
          value={draft.environmentIntensity}
          onChange={(v) => update({ environmentIntensity: v })}
          suffix="×"
        />
        <ToggleField
          label={t("admin.sceneLightProbeEnabled")}
          checked={draft.lightProbeEnabled}
          onChange={(v) => update({ lightProbeEnabled: v }, { commit: true })}
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
        <SliderField
          label={t("admin.sceneNorthRotation")}
          min={-180}
          max={180}
          step={1}
          value={draft.northRotationDeg}
          onChange={(v) => update({ northRotationDeg: v })}
          suffix="°"
        />
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

        {/* --- Sun (Task 2 — Track A + full-configurator pass) --- */}
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
          {/* Intensity now applies under both modes — previously ignored
              entirely under "geographic" (RenderEngine.ts's
              applySunAndEnvironment), so it's no longer gated to manual-only. */}
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
          <div className="mt-3">
            <ToggleField
              label={t("admin.sunLensflare")}
              checked={draft.lensflareEnabled}
              onChange={(v) => update({ lensflareEnabled: v }, { commit: true })}
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

        {sunTimes && (
          <p className="text-[11px] text-neutral-400">
            {t("admin.sceneSunTimes", {
              sunrise: formatUTCHour(sunTimes.sunriseHourUTC),
              sunset: formatUTCHour(sunTimes.sunsetHourUTC),
            })}
          </p>
        )}
      </div>
    </section>
  );
}
