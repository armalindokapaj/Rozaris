"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useAppStore, defaultProject3DConfig, defaultProjectDetailModel } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { extractUnitNodeNames } from "@/lib/glbUnitNodes";
import { ThreeProjectViewer } from "@/components/project/ThreeProjectViewer";
import type {
  BackgroundPreset,
  LightingPreset,
  Project,
  Project3DConfig,
  ProjectDetailModel,
} from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

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

  // --- Detailed GLB (Project 3D Experience) — real Postgres row, not
  // Zustand, mirroring MapModelEditor's reasoning: a shared upload every
  // visitor's browser sees, not just this one. See ProjectDetailModel's doc
  // comment in src/lib/types.ts.
  const [detailDraft, setDetailDraft] = useState<ProjectDetailModel>(defaultProjectDetailModel);
  const [detailLoaded, setDetailLoaded] = useState(false);
  // Instant local preview URL isn't rendered anywhere (unlike MapModelEditor
  // — this editor's live preview only reflects a saved+enabled model, see
  // this section's doc comment in the plan) — only tracked so it can be
  // revoked, hence a ref rather than state that would force a re-render.
  const localPreviewUrlRef = useRef<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSavedFlash, setDetailSavedFlash] = useState(false);
  const [detectedNodes, setDetectedNodes] = useState<string[] | null>(null);
  const [nodesLoading, setNodesLoading] = useState(false);
  // meshName -> unitId ("" = intentionally left unlinked)
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail-models/${project.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: (ProjectDetailModel & { unitLinks?: { meshName: string; unitId: string }[] }) | null) => {
        if (cancelled) return;
        if (row) {
          setDetailDraft(row);
          const selections: Record<string, string> = {};
          (row.unitLinks ?? []).forEach((link) => {
            selections[link.meshName] = link.unitId;
          });
          setLinkSelections(selections);
          if (row.glbUrl) detectNodes(row.glbUrl);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  async function detectNodes(glbUrl: string) {
    setNodesLoading(true);
    try {
      const names = await extractUnitNodeNames(glbUrl);
      setDetectedNodes(names);
    } catch {
      setDetectedNodes(null);
    } finally {
      setNodesLoading(false);
    }
  }

  function updateDetail(partial: Partial<ProjectDetailModel>) {
    setDetailDraft((d) => ({ ...d, ...partial }));
  }

  async function handleDetailFile(file: File) {
    setDetailError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setDetailError(t("admin.detailModelInvalidFile"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDetailError(t("admin.detailModelTooLarge", { max: formatBytes(MAX_FILE_BYTES) }));
      return;
    }
    if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
    localPreviewUrlRef.current = URL.createObjectURL(file);
    setDetailBusy(true);
    setUploadProgress(0);
    setDetectedNodes(null);
    setLinkSelections({});
    try {
      const blob = await upload(`project-detail-models/${project.id}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
      });
      updateDetail({ glbUrl: blob.url, fileName: file.name, fileSize: file.size });
      await detectNodes(blob.url);
    } catch {
      setDetailError(t("admin.detailModelUploadFailed"));
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
    } finally {
      setDetailBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleDetailRemove() {
    setDetailBusy(true);
    try {
      if (detailDraft.glbUrl) {
        await fetch("/api/blob/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: detailDraft.glbUrl }),
        });
      }
      await fetch(`/api/detail-models/${project.id}`, { method: "DELETE" });
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      setDetailDraft(defaultProjectDetailModel);
      setDetectedNodes(null);
      setLinkSelections({});
    } finally {
      setDetailBusy(false);
    }
  }

  async function handleSaveDetailModel() {
    if (!detailDraft.glbUrl) return;
    await fetch(`/api/detail-models/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        glbUrl: detailDraft.glbUrl,
        fileName: detailDraft.fileName,
        fileSize: detailDraft.fileSize,
        scale: detailDraft.scale,
        rotationDeg: detailDraft.rotationDeg,
        altitudeOffset: detailDraft.altitudeOffset,
        enabled: detailDraft.enabled,
      }),
    });
    const links = Object.entries(linkSelections)
      .filter(([, unitId]) => unitId)
      .map(([meshName, unitId]) => ({ meshName, unitId }));
    await fetch(`/api/detail-models/${project.id}/links`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(links),
    });
  }

  function update(partial: Partial<Project3DConfig>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function handleSave() {
    setProject3DConfig(project.id, { ...draft, status: "published" });
    if (detailDraft.glbUrl) {
      setDetailBusy(true);
      setDetailError(null);
      try {
        await handleSaveDetailModel();
        setDetailSavedFlash(true);
        setTimeout(() => setDetailSavedFlash(false), 2500);
      } catch {
        setDetailError(t("admin.detailModelSaveFailed"));
      } finally {
        setDetailBusy(false);
      }
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  function handleReset() {
    resetProject3DConfig(project.id);
    setDraft(defaultProject3DConfig);
  }

  const hasDetailModel = !!detailDraft.fileName;
  const linkedCount = Object.values(linkSelections).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-label={t("admin.viewer3DTitle")}
    >
      <div className="flex h-full w-full flex-col bg-white shadow-[var(--shadow-2)] lg:max-w-4xl lg:flex-row">
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

            <div className="border-t border-neutral-100 pt-5">
              <h3 className="mb-1 text-sm font-bold text-neutral-900">{t("admin.detailModelTitle")}</h3>
              <p className="mb-3 text-xs text-neutral-500">{t("admin.detailModelSubtitle")}</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDetailFile(file);
                  e.target.value = "";
                }}
              />
              {hasDetailModel ? (
                <div className="flex items-center justify-between gap-2 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-800">{detailDraft.fileName}</p>
                    <p className="text-xs text-neutral-500">{formatBytes(detailDraft.fileSize)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={detailBusy}
                      className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                    >
                      {t("admin.detailModelReplace")}
                    </button>
                    <button
                      onClick={handleDetailRemove}
                      disabled={detailBusy}
                      aria-label={t("admin.detailModelRemove")}
                      className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={detailBusy}
                  className="flex w-full flex-col items-center gap-2 rounded-panel border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-40"
                >
                  <Upload className="h-6 w-6 text-neutral-400" />
                  <span className="text-sm font-semibold text-neutral-700">{t("admin.detailModelUpload")}</span>
                  <span className="text-xs text-neutral-400">{t("admin.mapModelAccepted")}</span>
                </button>
              )}
              {uploadProgress != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round(uploadProgress)}%` }}
                  />
                </div>
              )}
              {detailError && <p className="mt-2 text-xs font-medium text-red-600">{detailError}</p>}

              {hasDetailModel && (
                <div className="mt-4 space-y-4">
                  <SliderField
                    label={t("admin.detailModelScale")}
                    min={0.01}
                    max={20}
                    step={0.01}
                    value={detailDraft.scale}
                    onChange={(v) => updateDetail({ scale: v })}
                  />
                  <SliderField
                    label={t("admin.detailModelRotation")}
                    min={0}
                    max={359}
                    step={1}
                    value={detailDraft.rotationDeg}
                    onChange={(v) => updateDetail({ rotationDeg: v })}
                    suffix="°"
                  />
                  <SliderField
                    label={t("admin.detailModelAltitude")}
                    min={-20}
                    max={50}
                    step={0.5}
                    value={detailDraft.altitudeOffset}
                    onChange={(v) => updateDetail({ altitudeOffset: v })}
                    suffix="m"
                  />
                  <ToggleField
                    label={t("admin.detailModelEnabled")}
                    checked={detailDraft.enabled}
                    onChange={(v) => updateDetail({ enabled: v })}
                  />
                </div>
              )}

              {hasDetailModel && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
                      {t("admin.detailModelLinkUnitsTitle")}
                    </h4>
                    {detectedNodes && (
                      <span className="text-xs font-medium text-neutral-500">
                        {t("admin.detailModelLinkUnitsCount", { linked: linkedCount, total: detectedNodes.length })}
                      </span>
                    )}
                  </div>

                  {nodesLoading && (
                    <p className="text-xs text-neutral-400">{t("admin.detailModelDetecting")}</p>
                  )}
                  {!nodesLoading && detectedNodes && detectedNodes.length === 0 && (
                    <p className="text-xs text-neutral-400">{t("admin.detailModelNoNodes")}</p>
                  )}
                  {!nodesLoading && detectedNodes && detectedNodes.length > 0 && (
                    <div className="space-y-2">
                      {detectedNodes.map((meshName) => (
                        <div key={meshName} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate font-mono text-xs text-neutral-600">
                            {meshName}
                          </span>
                          <select
                            value={linkSelections[meshName] ?? ""}
                            onChange={(e) =>
                              setLinkSelections((s) => ({ ...s, [meshName]: e.target.value }))
                            }
                            className="w-full rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
                          >
                            <option value="">{t("admin.detailModelUnlinked")}</option>
                            {project.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.code} · {t("admin.detailModelFloorLabel", { floor: u.floor })} ·{" "}
                                {t(`unit.status${u.status[0].toUpperCase()}${u.status.slice(1)}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailSavedFlash && (
                <p className="mt-3 rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                  {t("admin.detailModelSaved")}
                </p>
              )}
            </div>
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
                disabled={!detailLoaded || detailBusy}
                className="flex-1 rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
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
