"use client";

import type { RefObject } from "react";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import type { Project3DConfig } from "@/lib/types";
import { defaultProject3DConfig } from "@/lib/store";
import { SliderField, ToggleField } from "../fields";
import type { SetOpts, Translate } from "../editorTypes";
import { RotateCcw, Trash2 } from "lucide-react";

/** Fields this panel's "Reset camera" button restores — deliberately just
 * the camera-related subset of Project3DConfig, not the whole config
 * (lighting/materials/etc. stay untouched by this button). */
const CAMERA_RESET_FIELDS: Partial<Project3DConfig> = {
  cameraStartDistanceMultiplier: defaultProject3DConfig.cameraStartDistanceMultiplier,
  cameraMinDistanceMultiplier: defaultProject3DConfig.cameraMinDistanceMultiplier,
  cameraMaxDistanceMultiplier: defaultProject3DConfig.cameraMaxDistanceMultiplier,
  cameraMinPolarDeg: defaultProject3DConfig.cameraMinPolarDeg,
  cameraMaxPolarDeg: defaultProject3DConfig.cameraMaxPolarDeg,
  cameraFovDesktop: defaultProject3DConfig.cameraFovDesktop,
  cameraFovMobile: defaultProject3DConfig.cameraFovMobile,
};

/**
 * Camera mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * "Camera" (887-960) and "Camera Presets" (962-1017) sections. Min-polar
 * limit + "Reset camera" button added alongside the full-configurator
 * pass; `groundEnabled` moved out to LightingPanel's "Environment" section
 * (was misplaced here relative to the spec's Camera/Environment grouping).
 */
export function CameraPanel({
  draft,
  update,
  viewerRef,
  newPresetLabel,
  setNewPresetLabel,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
  newPresetLabel: string;
  setNewPresetLabel: (v: string) => void;
  t: Translate;
}) {
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            {t("admin.sceneCameraTitle")}
          </h3>
          <button
            type="button"
            onClick={() => update(CAMERA_RESET_FIELDS, { commit: true })}
            className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-800"
          >
            <RotateCcw className="h-3 w-3" />
            {t("admin.sceneCameraReset")}
          </button>
        </div>
        <div className="space-y-3">
          <ToggleField
            label={t("admin.viewer3DAutoRotate")}
            checked={draft.autoRotate}
            onChange={(v) => update({ autoRotate: v }, { commit: true })}
          />
          <ToggleField
            label={t("admin.viewer3DConstructionStages")}
            checked={draft.constructionStagesEnabled}
            onChange={(v) => update({ constructionStagesEnabled: v }, { commit: true })}
          />
          <SliderField
            label={t("admin.viewer3DCameraStart")}
            min={0.5}
            max={2}
            step={0.05}
            value={draft.cameraStartDistanceMultiplier}
            onChange={(v) => update({ cameraStartDistanceMultiplier: v })}
          />
          <SliderField
            label={t("admin.viewer3DCameraMin")}
            min={0.1}
            max={1.5}
            step={0.05}
            value={draft.cameraMinDistanceMultiplier}
            onChange={(v) => update({ cameraMinDistanceMultiplier: v })}
          />
          <SliderField
            label={t("admin.viewer3DCameraMax")}
            min={1}
            max={5}
            step={0.1}
            value={draft.cameraMaxDistanceMultiplier}
            onChange={(v) => update({ cameraMaxDistanceMultiplier: v })}
          />
          <SliderField
            label={t("admin.viewer3DMinPolar")}
            min={0}
            max={40}
            step={1}
            value={draft.cameraMinPolarDeg}
            onChange={(v) => update({ cameraMinPolarDeg: v })}
            suffix="°"
          />
          <SliderField
            label={t("admin.viewer3DMaxPolar")}
            min={40}
            max={110}
            step={1}
            value={draft.cameraMaxPolarDeg}
            onChange={(v) => update({ cameraMaxPolarDeg: v })}
            suffix="°"
          />
          <SliderField
            label={t("admin.sceneCameraFovDesktop")}
            min={20}
            max={70}
            step={1}
            value={draft.cameraFovDesktop}
            onChange={(v) => update({ cameraFovDesktop: v })}
            suffix="°"
          />
          <SliderField
            label={t("admin.sceneCameraFovMobile")}
            min={20}
            max={70}
            step={1}
            value={draft.cameraFovMobile}
            onChange={(v) => update({ cameraFovMobile: v })}
            suffix="°"
          />
        </div>
      </section>

      <section className="border-t border-neutral-100 pt-5">
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {t("admin.sceneCameraPresetsTitle")}
        </h3>
        {draft.cameraPresets.length === 0 ? (
          <p className="mb-2.5 text-[11px] text-neutral-400">{t("admin.sceneCameraPresetsEmpty")}</p>
        ) : (
          // Restyled (dark-theme configurator pass) from a vertical list to
          // a horizontal scrollable chip strip, matching the reference
          // mockup's camera-view strip — label-only, no thumbnails:
          // CameraPreset has no image field and no capture step exists
          // (declined scope, see the "rozaris-3d-configurator-redesign"
          // memory), so this stays the same numeric position/target/fov
          // data as before, just presented as chips instead of rows.
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto scroll-thin">
            {draft.cameraPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex shrink-0 items-center gap-1.5 rounded-pill border border-neutral-200 py-1.5 pl-3 pr-1.5 text-xs"
              >
                <span className="font-semibold text-neutral-800">{preset.label}</span>
                <button
                  onClick={() =>
                    update({ cameraPresets: draft.cameraPresets.filter((p) => p.id !== preset.id) }, { commit: true })
                  }
                  aria-label={t("common.close")}
                  className="rounded-full p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={newPresetLabel}
            onChange={(e) => setNewPresetLabel(e.target.value)}
            placeholder={t("admin.sceneCameraPresetLabelPlaceholder")}
            className="min-w-0 flex-1 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
          />
          <button
            onClick={() => {
              const state = viewerRef.current?.getCameraState();
              const label = newPresetLabel.trim();
              if (!state || !label) return;
              update(
                { cameraPresets: [...draft.cameraPresets, { id: `preset-${Date.now()}`, label, ...state, durationMs: 900 }] },
                { commit: true }
              );
              setNewPresetLabel("");
            }}
            disabled={!newPresetLabel.trim()}
            className="shrink-0 rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {t("admin.sceneCameraPresetSaveCurrent")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-400">{t("admin.sceneCameraPresetNote")}</p>
      </section>
    </div>
  );
}
