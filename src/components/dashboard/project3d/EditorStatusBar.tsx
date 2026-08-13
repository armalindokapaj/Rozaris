"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUALITY_PRESET_ORDER } from "@/lib/viewerPresets";
import type { Project3DConfig } from "@/lib/types";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import type { PreviewWidth, Translate } from "./editorTypes";

const PREVIEW_WIDTH_OPTIONS: [PreviewWidth, typeof Monitor, string][] = [
  ["desktop", Monitor, "admin.statusBarPreviewDesktop"],
  ["tablet", Tablet, "admin.statusBarPreviewTablet"],
  ["mobile", Smartphone, "admin.statusBarPreviewMobile"],
];

/**
 * Full-width global bottom bar (Inventory/Floors mockup pass, 2026-08-13).
 * Real data only: autosave status (existing `AutosaveStatus` logic,
 * restyled as a colored dot), Triangles/Draw Calls (the same real
 * `perfStats` `EffectsPanel.tsx`'s Performance Overview already samples —
 * no GPU Memory card, not tracked anywhere in this app), Quality Preset
 * (relocated here as its single editable location, removed from
 * `EffectsPanel.tsx` to avoid two live editable controls for one field),
 * and a real Desktop/Tablet/Mobile toggle — `onPreviewWidthChange`
 * actually constrains the viewport column's CSS width in `EditorShell.tsx`,
 * not a stub.
 */
export function EditorStatusBar({
  autosaveStatus,
  autosaveError,
  onAutosaveRetry,
  perfStats,
  qualityPreset,
  onQualityPresetChange,
  previewWidth,
  onPreviewWidthChange,
  t,
}: {
  autosaveStatus: AutosaveStatus;
  autosaveError: string | null;
  onAutosaveRetry: () => void;
  perfStats: { fps: number; drawCalls: number; triangles: number; dpr: number } | null;
  qualityPreset: Project3DConfig["qualityPreset"];
  onQualityPresetChange: (v: Project3DConfig["qualityPreset"]) => void;
  previewWidth: PreviewWidth;
  onPreviewWidthChange: (v: PreviewWidth) => void;
  t: Translate;
}) {
  const dotColor =
    autosaveStatus === "error" ? "bg-red-500" : autosaveStatus === "saving" ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-5 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)} />
        {autosaveStatus === "error" ? (
          <>
            <span className="truncate font-medium text-red-600">{autosaveError || t("admin.autosaveError")}</span>
            <button onClick={onAutosaveRetry} className="shrink-0 font-semibold text-red-600 underline hover:text-red-700">
              {t("admin.autosaveRetry")}
            </button>
          </>
        ) : autosaveStatus === "saving" ? (
          <span className="text-neutral-500">{t("admin.autosaveSaving")}</span>
        ) : (
          <span className="text-neutral-400">{t("admin.statusBarAllSaved")}</span>
        )}
      </div>

      {perfStats && (
        <div className="flex shrink-0 items-center gap-4 text-neutral-500">
          <span>
            {t("admin.perfTriangles")}:{" "}
            <span className="font-numeric font-semibold text-neutral-800">{perfStats.triangles.toLocaleString()}</span>
          </span>
          <span>
            {t("admin.perfDrawCalls")}:{" "}
            <span className="font-numeric font-semibold text-neutral-800">{perfStats.drawCalls}</span>
          </span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-3">
        <select
          value={qualityPreset}
          onChange={(e) => onQualityPresetChange(e.target.value as Project3DConfig["qualityPreset"])}
          title={t("admin.sceneQualityPreset")}
          className="rounded-control border border-neutral-200 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
        >
          {QUALITY_PRESET_ORDER.map((id) => (
            <option key={id} value={id}>
              {t(`admin.sceneQuality_${id}`)}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-0.5 rounded-control border border-neutral-200 p-0.5">
          {PREVIEW_WIDTH_OPTIONS.map(([id, Icon, labelKey]) => (
            <button
              key={id}
              type="button"
              onClick={() => onPreviewWidthChange(id)}
              aria-pressed={previewWidth === id}
              title={t(labelKey)}
              className={cn(
                "rounded-control p-1.5",
                previewWidth === id ? "bg-brand-500 text-white" : "text-neutral-500 hover:bg-neutral-100"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
