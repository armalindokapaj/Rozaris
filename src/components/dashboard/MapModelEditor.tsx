"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Trash2, Upload, X } from "lucide-react";
import { defaultProjectMapModel } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { MapModelMapPreview } from "./MapModelMapPreview";
import type { Project, ProjectMapModel } from "@/lib/types";

const MAX_FILE_BYTES = 60 * 1024 * 1024; // keep in sync with api/blob/upload's maximumSizeInBytes

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Admin's "3D Map Control" authoring surface — upload a GLB from disk (goes
 * straight to Vercel Blob, a real shared URL any visitor's browser can load
 * — see src/app/api/blob/upload), place it (scale/rotation/altitude)
 * against MapModelMapPreview — the SAME Mapbox map/style/ProjectModelLayer
 * as every other map in Rozaris, centered on this project's real
 * coordinates, so what Admin sees while dialing in the placement is exactly
 * what a visitor sees on the live search map, not a stand-in for it. Save
 * writes the placement record to Postgres (/api/map-models/[projectId]) —
 * a real, shared row, not Zustand — so a model an admin publishes shows up
 * for every visitor, not just this browser. Mirrors Project3DConfigEditor's
 * draft/publish split next to it.
 */
export function MapModelEditor({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useT();

  const [draft, setDraft] = useState<ProjectMapModel>(defaultProjectMapModel);
  const [loaded, setLoaded] = useState(false);
  // Instant local preview (picked file, pre-upload) takes priority over the
  // already-published glbUrl so Admin sees the *new* file immediately
  // instead of waiting on the upload to finish.
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/map-models/${project.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((saved: ProjectMapModel | null) => {
        if (!cancelled && saved) setDraft(saved);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
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
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setBusy(true);
    setUploadProgress(0);
    try {
      const blob = await upload(`project-map-models/${project.id}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        onUploadProgress: (p) => setUploadProgress(p.percentage),
      });
      update({ glbUrl: blob.url, fileName: file.name, fileSize: file.size });
    } catch {
      setError(t("admin.mapModelUploadFailed"));
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      if (draft.glbUrl) {
        await fetch("/api/blob/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: draft.glbUrl }),
        });
      }
      await fetch(`/api/map-models/${project.id}`, { method: "DELETE" });
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setDraft(defaultProjectMapModel);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/map-models/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          glbUrl: draft.glbUrl,
          fileName: draft.fileName,
          fileSize: draft.fileSize,
          scale: draft.scale,
          rotationDeg: draft.rotationDeg,
          altitudeOffset: draft.altitudeOffset,
          enabled: draft.enabled,
          hideBaseBuilding: draft.hideBaseBuilding,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      setError(t("admin.mapModelSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const hasModel = !!draft.fileName;
  const previewUrl = localPreviewUrl ?? (draft.glbUrl || null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-label={t("admin.mapModelTitle")}
    >
      <div className="flex h-full w-full flex-col bg-white shadow-[var(--shadow-2)] lg:max-w-4xl lg:flex-row">
        <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
          <MapModelMapPreview
            coords={project.coords}
            glbUrl={previewUrl}
            scale={draft.scale}
            rotationDeg={draft.rotationDeg}
            altitudeOffset={draft.altitudeOffset}
            hideBaseBuilding={draft.hideBaseBuilding}
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
              {uploadProgress != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${Math.round(uploadProgress)}%` }}
                  />
                </div>
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
            <ToggleField
              label={t("admin.mapModelHideBuilding")}
              checked={draft.hideBaseBuilding}
              onChange={(v) => update({ hideBaseBuilding: v })}
            />
            <p className="-mt-3 text-[11px] text-neutral-400">
              {t("admin.mapModelHideBuildingNote")}
            </p>
          </div>

          <div className="shrink-0 space-y-2 border-t border-neutral-100 p-4">
            {savedFlash && (
              <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                {t("admin.mapModelSaved")}
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={!hasModel || busy || !loaded}
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
