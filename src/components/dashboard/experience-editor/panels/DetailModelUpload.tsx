"use client";

import { History, RotateCcw, Trash2, Upload } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { ValidationBadge } from "../../ValidationBadge";
import { SlotTabStrip } from "./SlotTabStrip";
import type { UseDetailModelSlotsReturn } from "@/hooks/useDetailModelSlots";
import type { Locale } from "@/lib/types";

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DetailModelUpload({ slots: detail, locale }: { slots: UseDetailModelSlotsReturn; locale: Locale }) {
  const {
    slots,
    activeSlotId,
    versionsBySlot,
    versions,
    activeVersion,
    canEditDetail,
    detailBusy,
    uploadProgress,
    detailError,
    detailFlash,
    keepUnitLinks,
    setKeepUnitLinks,
    fileInputRef,
    onFile,
    handleSelectSlot,
    handleAddSlot,
    handleRenameSlot,
    handleDeleteSlot,
    handleDiscardDraft,
    handleRemoveDetailModel,
    handleDeleteModel,
    handleDeleteVersion,
    handleDetailRollback,
  } = detail;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900">
      <SlotTabStrip
        slots={slots}
        activeSlotId={activeSlotId}
        versionsBySlot={versionsBySlot}
        onSelect={handleSelectSlot}
        onAdd={handleAddSlot}
        onRename={handleRenameSlot}
        onDelete={handleDeleteSlot}
      />

      <h3 className="mb-1 text-sm font-bold text-neutral-900">Detailed model (Project 3D Experience)</h3>
      <p className="mb-3 text-xs text-neutral-500">
        A separate, much more detailed GLB for this project&apos;s own 3D page — renders on a live map, zoomed into
        this building. Add named &quot;Unit_&lt;number&gt;&quot; boxes in the file to link them to real units below.
      </p>

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

      {activeVersion ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-800">
                {activeVersion.fileName} <span className="font-normal text-neutral-400">v{activeVersion.version}</span>
              </p>
              <p className="text-xs text-neutral-500">{formatBytes(activeVersion.fileSize)}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={detailBusy}
                className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
              >
                Replace
              </button>
              {canEditDetail ? (
                <button
                  onClick={handleDiscardDraft}
                  disabled={detailBusy}
                  aria-label="Discard draft"
                  title="Discard draft"
                  className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                activeVersion.publicationStatus === "published" && (
                  <button
                    onClick={handleRemoveDetailModel}
                    disabled={detailBusy}
                    aria-label="Remove model"
                    title="Remove model"
                    className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )
              )}
              <button
                onClick={handleDeleteModel}
                disabled={detailBusy}
                title="Delete model"
                className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete model
              </button>
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={keepUnitLinks}
              onChange={(e) => setKeepUnitLinks(e.target.checked)}
              disabled={detailBusy}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-neutral-900"
            />
            <span>
              <span className="font-semibold text-neutral-800">Keep unit mappings when replacing</span>
              <span className="block text-neutral-500">
                Blocks with the same name keep the unit they&apos;re linked to; anything new in the file is added
                unmapped. Uncheck to start the mapping over.
              </span>
            </span>
          </label>
          <div className="flex items-center justify-between">
            <ValidationBadge status={activeVersion.validationStatus} issues={activeVersion.validationIssues} />
            <span
              className={cn(
                "text-[11px] font-semibold",
                activeVersion.publicationStatus === "published" ? "text-green-600" : "text-amber-600"
              )}
            >
              {activeVersion.publicationStatus === "published" ? "Published" : "Draft"}
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={detailBusy}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-40"
        >
          <Upload className="h-6 w-6 text-neutral-400" />
          <span className="text-sm font-semibold text-neutral-700">Upload GLB</span>
          <span className="text-xs text-neutral-400">.glb files only, up to 60 MB</span>
        </button>
      )}

      {uploadProgress != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.round(uploadProgress)}%` }} />
        </div>
      )}
      {detailError && <p className="mt-2 text-xs font-medium text-red-600">{detailError}</p>}
      {!canEditDetail && activeVersion && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Viewing the published version — replace to start a new draft.
        </p>
      )}
      {detailFlash && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700">{detailFlash}</p>
      )}

      <div className="mt-4">
        <button
          onClick={() => {
            const el = document.getElementById(`version-history-${activeSlotId}`);
            el?.classList.toggle("hidden");
          }}
          className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-500"
        >
          <span className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Version history
          </span>
          <span>{versions.length}</span>
        </button>
        <div id={`version-history-${activeSlotId}`} className="mt-2 hidden space-y-1.5">
          {versions.length === 0 && <p className="text-xs text-neutral-400">No versions yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-100 px-3 py-2 text-xs">
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
                  {v.publicationStatus[0].toUpperCase() + v.publicationStatus.slice(1)}
                </span>
                <p className="text-[10px] text-neutral-400">{formatRelativeDate(v.createdAt, locale)}</p>
              </div>
              {v.publicationStatus === "archived" && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => handleDetailRollback(v.id)}
                    disabled={detailBusy}
                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" /> Rollback
                  </button>
                  <button
                    onClick={() => handleDeleteVersion(v)}
                    disabled={detailBusy}
                    aria-label="Delete version"
                    title="Delete version"
                    className="rounded-md border border-red-200 p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
