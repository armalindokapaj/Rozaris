"use client";

import type { RefObject } from "react";
import { History, RotateCcw, Trash2, Upload } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { Locale } from "@/lib/types";
import { ValidationBadge } from "../../ValidationBadge";
import { ChecklistRow, SliderField } from "../fields";
import type { Translate } from "../editorTypes";
import type { DetailVersionRow } from "../types";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Model mode panel — moved verbatim from Project3DConfigEditor.tsx's
 * Detailed GLB upload/header (1113-1222), scale/rotation/altitude sliders
 * (1223-1254), detail-save flash (1466-1470), Publish checklist
 * (1472-1490), Save Draft/Publish buttons (1492-1509), and Version History
 * (1511-1573) — the version's own document-level actions all live here
 * since they're all "what is the GLB, and what state is it in" concerns.
 */
export function ModelPanel({
  fileInputRef,
  onFile,
  hasDetailModel,
  activeVersion,
  canEditDetail,
  detailBusy,
  onDiscardDraft,
  onRemoveDetailModel,
  onDeleteModel,
  uploadProgress,
  detailError,
  scale,
  setScale,
  rotationDeg,
  setRotationDeg,
  altitudeOffset,
  setAltitudeOffset,
  detailFlash,
  needsReviewCount,
  matchedCount,
  nodeOverrideCount,
  onDetailSave,
  detailLoaded,
  showHistory,
  setShowHistory,
  versions,
  onDetailRollback,
  onDeleteVersion,
  locale,
  t,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  hasDetailModel: boolean;
  activeVersion: DetailVersionRow | null;
  canEditDetail: boolean;
  detailBusy: boolean;
  onDiscardDraft: () => void;
  onRemoveDetailModel: () => void;
  onDeleteModel: () => void;
  uploadProgress: number | null;
  detailError: string | null;
  scale: number;
  setScale: (v: number) => void;
  rotationDeg: number;
  setRotationDeg: (v: number) => void;
  altitudeOffset: number;
  setAltitudeOffset: (v: number) => void;
  detailFlash: string | null;
  needsReviewCount: number;
  matchedCount: number;
  nodeOverrideCount: number;
  onDetailSave: () => void;
  detailLoaded: boolean;
  showHistory: boolean;
  setShowHistory: (v: boolean | ((prev: boolean) => boolean)) => void;
  versions: DetailVersionRow[];
  onDetailRollback: (versionId: string) => void;
  onDeleteVersion: (version: DetailVersionRow) => void;
  locale: Locale;
  t: Translate;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-bold text-neutral-900">{t("admin.detailModelTitle")}</h3>
        <p className="mb-3 text-xs text-neutral-500">{t("admin.detailModelSubtitle")}</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,model/gltf-binary"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {hasDetailModel && activeVersion ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-panel border border-neutral-200 bg-neutral-50 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-800">
                  {activeVersion.fileName}{" "}
                  <span className="font-normal text-neutral-400">v{activeVersion.version}</span>
                </p>
                <p className="text-xs text-neutral-500">{formatBytes(activeVersion.fileSize)}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={detailBusy}
                  className="rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                >
                  {t("admin.detailModelReplace")}
                </button>
                {canEditDetail ? (
                  <button
                    onClick={onDiscardDraft}
                    disabled={detailBusy}
                    aria-label={t("admin.discardDraft")}
                    title={t("admin.discardDraft")}
                    className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  activeVersion.publicationStatus === "published" && (
                    <button
                      onClick={onRemoveDetailModel}
                      disabled={detailBusy}
                      aria-label={t("admin.detailModelRemove")}
                      title={t("admin.detailModelRemove")}
                      className="rounded-control border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                {/* Real permanent delete, any status — distinct from the
                    soft icon-only actions above (discard-draft /
                    archive-published), which stay as-is. */}
                <button
                  onClick={onDeleteModel}
                  disabled={detailBusy}
                  title={t("admin.detailModelDeleteModel")}
                  className="flex items-center gap-1 rounded-control border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("admin.detailModelDeleteModel")}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <ValidationBadge status={activeVersion.validationStatus} issues={activeVersion.validationIssues} />
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  activeVersion.publicationStatus === "published" ? "text-green-600" : "text-amber-600"
                )}
              >
                {activeVersion.publicationStatus === "published" ? t("admin.statusPublished") : t("admin.statusDraft")}
              </span>
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
        {!canEditDetail && hasDetailModel && (
          <p className="mt-2 rounded-control bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {t("admin.viewingPublishedNote")}
          </p>
        )}

        {hasDetailModel && (
          <fieldset disabled={!canEditDetail} className="mt-4 space-y-4 disabled:opacity-50">
            <SliderField
              label={t("admin.detailModelScale")}
              min={0.01}
              max={20}
              step={0.01}
              value={scale}
              onChange={setScale}
              suffix="×"
            />
            <p className="-mt-2 text-[11px] text-neutral-400">{t("admin.mapModelScaleNote")}</p>
            <SliderField
              label={t("admin.detailModelRotation")}
              min={0}
              max={359}
              step={1}
              value={rotationDeg}
              onChange={setRotationDeg}
              suffix="°"
            />
            <SliderField
              label={t("admin.detailModelAltitude")}
              min={-20}
              max={50}
              step={0.5}
              value={altitudeOffset}
              onChange={setAltitudeOffset}
              suffix="m"
            />
          </fieldset>
        )}
      </div>

      {detailFlash && (
        <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">{detailFlash}</p>
      )}

      {hasDetailModel && activeVersion && (
        <div className="space-y-1 rounded-control border border-neutral-200 bg-neutral-50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            {t("admin.publishChecklistTitle")}
          </p>
          <ChecklistRow
            status={activeVersion.validationStatus === "blocked" ? "warn" : "ok"}
            label={t(
              `admin.validation${activeVersion.validationStatus[0].toUpperCase()}${activeVersion.validationStatus.slice(1)}`
            )}
          />
          <ChecklistRow
            status={needsReviewCount === 0 ? "ok" : "warn"}
            label={t("admin.publishChecklistUnits", { matched: matchedCount, needsReview: needsReviewCount })}
          />
          <ChecklistRow status="info" label={t("admin.publishChecklistOverrides", { count: nodeOverrideCount })} />
        </div>
      )}

      {/* Publish itself moved to the global header (Inventory/Floors mockup
          pass) — same real onDetailPublish + disabled logic, just reachable
          from every tab instead of only here. Save Draft stays — it's
          Model-tab-specific (persists scale/rotation/link/override edits
          without publishing). */}
      {hasDetailModel && (
        <div className="flex gap-2">
          <button
            onClick={onDetailSave}
            disabled={!canEditDetail || detailBusy || !detailLoaded}
            className="flex-1 rounded-control border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
          >
            {t("admin.saveDraft")}
          </button>
        </div>
      )}

      <div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-500"
        >
          <span className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> {t("admin.versionHistory")}
          </span>
          <span>{versions.length}</span>
        </button>
        {showHistory && (
          <div className="mt-2 space-y-1.5">
            {versions.length === 0 && <p className="text-xs text-neutral-400">{t("admin.noVersionsYet")}</p>}
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-control border border-neutral-100 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-neutral-700">v{v.version}</span>{" "}
                  <span
                    className={cn(
                      "font-medium",
                      v.publicationStatus === "published"
                        ? "text-green-600"
                        : v.publicationStatus === "draft"
                        ? "text-amber-600"
                        : "text-neutral-400"
                    )}
                  >
                    {t(`admin.status${v.publicationStatus[0].toUpperCase()}${v.publicationStatus.slice(1)}`)}
                  </span>
                  <p className="text-[10px] text-neutral-400">{formatRelativeDate(v.createdAt, locale)}</p>
                </div>
                {v.publicationStatus === "archived" && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => onDetailRollback(v.id)}
                      disabled={detailBusy}
                      className="flex items-center gap-1 rounded-control border border-neutral-200 px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" /> {t("admin.rollback")}
                    </button>
                    <button
                      onClick={() => onDeleteVersion(v)}
                      disabled={detailBusy}
                      aria-label={t("admin.detailModelDeleteModel")}
                      title={t("admin.detailModelDeleteModel")}
                      className="rounded-control border border-red-200 p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
