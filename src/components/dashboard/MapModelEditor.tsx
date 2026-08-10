"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Upload, X } from "lucide-react";
import { useAppStore, defaultProjectMapModel } from "@/lib/store";
import { getModelBlob, saveModelBlob, deleteModelBlob } from "@/lib/glbStorage";
import { useT } from "@/lib/i18n/useT";
import { GlbPreviewCanvas } from "./GlbPreviewCanvas";
import type { Project, ProjectMapModel } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // 60MB — generous for a "simple" GLB, still IndexedDB-safe.

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Admin's "3D Map Control" authoring surface — upload a GLB from disk, place
 * it (scale/rotation/altitude) against a live preview with a 5m reference
 * grid, then publish it to the real Mapbox map at this project's real lng/
 * lat (ProjectModelLayer, MapView.tsx). The binary is saved to IndexedDB
 * (lib/glbStorage.ts) the moment it's picked — Save here only publishes the
 * small placement record, mirroring Project3DConfigEditor's draft/publish
 * split next to it in the admin console.
 */
export function MapModelEditor({ project, onClose }: { project: Project; onClose: () => void }) {
  const saved = useAppStore((s) => s.projectMapModels[project.id]);
  const setProjectMapModel = useAppStore((s) => s.setProjectMapModel);
  const removeProjectMapModel = useAppStore((s) => s.removeProjectMapModel);
  const { t } = useT();

  const [draft, setDraft] = useState<ProjectMapModel>(
    saved ?? defaultProjectMapModel
  );
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load whatever's already stored for this project, once.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    getModelBlob(project.id).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setBlobUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [project.id]);

  function update(partial: Partial<ProjectMapModel>) {
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setError(t("admin.mapModelInvalidFile"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t("admin.mapModelTooLarge", { max: formatBytes(MAX_FILE_BYTES) }));
      return;
    }
    setBusy(true);
    try {
      await saveModelBlob(project.id, file);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      update({ fileName: file.name, fileSize: file.size });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await deleteModelBlob(project.id);
      removeProjectMapModel(project.id);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setDraft(defaultProjectMapModel);
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    setProjectMapModel(project.id, draft);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  const hasModel = !!draft.fileName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-label={t("admin.mapModelTitle")}
    >
      <div className="flex h-full w-full flex-col bg-white shadow-[0_8px_24px_rgba(17,17,24,0.10)] lg:max-w-4xl lg:flex-row">
        <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
          <GlbPreviewCanvas
            blobUrl={blobUrl}
            scale={draft.scale}
            rotationDeg={draft.rotationDeg}
            altitudeOffset={draft.altitudeOffset}
          />
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col border-t border-neutral-100 lg:h-full lg:w-96 lg:flex-none lg:border-l lg:border-t-0">
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-neutral-900">{t("admin.mapModelTitle")}</h2>
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
            <section>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,model/gltf-binary"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              {hasModel ? (
                <div className="flex items-center justify-between gap-2 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-800">{draft.fileName}</p>
                    <p className="text-xs text-neutral-500">{formatBytes(draft.fileSize)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={busy}
                      className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                    >
                      {t("admin.mapModelReplace")}
                    </button>
                    <button
                      onClick={handleRemove}
                      disabled={busy}
                      aria-label={t("admin.mapModelRemove")}
                      className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="flex w-full flex-col items-center gap-2 rounded-panel border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-40"
                >
                  <Upload className="h-6 w-6 text-neutral-400" />
                  <span className="text-sm font-semibold text-neutral-700">
                    {t("admin.mapModelUpload")}
                  </span>
                  <span className="text-xs text-neutral-400">{t("admin.mapModelAccepted")}</span>
                </button>
              )}
              {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
              <p className="mt-2 text-[11px] text-neutral-400">{t("admin.mapModelStorageNote")}</p>
            </section>

            <SliderField
              label={t("admin.mapModelScale")}
              min={0.01}
              max={20}
              step={0.01}
              value={draft.scale}
              onChange={(v) => update({ scale: v })}
            />
            <SliderField
              label={t("admin.mapModelRotation")}
              min={0}
              max={359}
              step={1}
              value={draft.rotationDeg}
              onChange={(v) => update({ rotationDeg: v })}
              suffix="°"
            />
            <SliderField
              label={t("admin.mapModelAltitude")}
              min={-20}
              max={50}
              step={0.5}
              value={draft.altitudeOffset}
              onChange={(v) => update({ altitudeOffset: v })}
              suffix="m"
            />

            <ToggleField
              label={t("admin.mapModelEnabled")}
              checked={draft.enabled}
              onChange={(v) => update({ enabled: v })}
            />
          </div>

          <div className="shrink-0 space-y-2 border-t border-neutral-100 p-4">
            {savedFlash && (
              <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                {t("admin.mapModelSaved")}
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={!hasModel}
              className="w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {t("admin.mapModelSave")}
            </button>
          </div>
        </div>
      </div>
    </div>
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
