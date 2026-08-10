"use client";

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { useAppStore, defaultProject3DConfig } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer } from "@/components/project/ThreeProjectViewer";
import type { BackgroundPreset, LightingPreset, Project, Project3DConfig } from "@/lib/types";

/**
 * Admin's "Project > 3D Experience" authoring surface (PRD_3D_Project_Viewer
 * §11/§15/§16/§17) — Scene, Camera and Lighting editors in one panel, with
 * a live preview using the exact same viewer the public Project Page
 * renders (§21: "Admin can preview without changing the public viewer").
 * There is no separate publisher submission/approval step here — Admin is
 * the only role permitted to author the 3D experience — so Save simply
 * writes the config live, unlike ConstructionTimelineEditor's request/
 * approve flow.
 */
export function Project3DConfigEditor({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const saved = useAppStore((s) => s.project3DConfigs[project.id]) ?? defaultProject3DConfig;
  const setProject3DConfig = useAppStore((s) => s.setProject3DConfig);
  const resetProject3DConfig = useAppStore((s) => s.resetProject3DConfig);
  const [draft, setDraft] = useState<Project3DConfig>(saved);
  const [savedFlash, setSavedFlash] = useState(false);
  const { t } = useT();

  function update(partial: Partial<Project3DConfig>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  function handleSave() {
    setProject3DConfig(project.id, { ...draft, status: "published" });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  function handleReset() {
    resetProject3DConfig(project.id);
    setDraft(defaultProject3DConfig);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-label={t("admin.viewer3DTitle")}
    >
      <div className="flex h-full w-full flex-col bg-white shadow-[0_8px_24px_rgba(17,17,24,0.10)] lg:max-w-4xl lg:flex-row">
        <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
          <ThreeProjectViewer project={project} config={draft} showChrome={false} />
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col border-t border-neutral-100 lg:h-full lg:w-96 lg:flex-none lg:border-l lg:border-t-0">
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-neutral-900">{t("admin.viewer3DTitle")}</h2>
              <p className="truncate text-xs text-neutral-500">{project.name}</p>
            </div>
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin p-5">
            <SelectField
              label={t("admin.viewer3DLighting")}
              value={draft.lightingPreset}
              onChange={(v) => update({ lightingPreset: v as LightingPreset })}
              options={[
                ["daylight", t("admin.viewer3DLightingDaylight")],
                ["overcast", t("admin.viewer3DLightingOvercast")],
                ["evening", t("admin.viewer3DLightingEvening")],
              ]}
            />
            <SelectField
              label={t("admin.viewer3DBackground")}
              value={draft.backgroundPreset}
              onChange={(v) => update({ backgroundPreset: v as BackgroundPreset })}
              options={[
                ["sky", t("admin.viewer3DBackgroundSky")],
                ["studio_light", t("admin.viewer3DBackgroundStudioLight")],
                ["studio_dark", t("admin.viewer3DBackgroundStudioDark")],
              ]}
            />

            <ToggleField
              label={t("admin.viewer3DGround")}
              checked={draft.groundEnabled}
              onChange={(v) => update({ groundEnabled: v })}
            />
            <ToggleField
              label={t("admin.viewer3DAutoRotate")}
              checked={draft.autoRotate}
              onChange={(v) => update({ autoRotate: v })}
            />
            <ToggleField
              label={t("admin.viewer3DConstructionStages")}
              checked={draft.constructionStagesEnabled}
              onChange={(v) => update({ constructionStagesEnabled: v })}
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
              label={t("admin.viewer3DMaxPolar")}
              min={40}
              max={110}
              step={1}
              value={draft.cameraMaxPolarDeg}
              onChange={(v) => update({ cameraMaxPolarDeg: v })}
              suffix="°"
            />
          </div>

          <div className="shrink-0 space-y-2 border-t border-neutral-100 p-4">
            {savedFlash && (
              <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                {t("admin.viewer3DSaved")}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("admin.viewer3DReset")}
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                {t("admin.viewer3DSave")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-500"
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
        {label}
        <span className="font-semibold text-neutral-800">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
    </label>
  );
}
