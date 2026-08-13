"use client";

import { ArrowLeft, ExternalLink, Moon, Redo2, RotateCcw, Sun, Undo2 } from "lucide-react";
import type { DetailVersionRow } from "./types";
import type { Translate } from "./editorTypes";

/**
 * Full-width global header (Inventory/Floors mockup pass, 2026-08-13) —
 * everything that used to live at the top of the right rail
 * (back/title/undo-redo/Preview link/Reset/Save Scene), plus Publish
 * relocated here from `ModelPanel.tsx`'s button row (same real
 * `onDetailPublish` + disabled logic — just reachable from every tab now,
 * matching the mockup, not only the Model tab) and a new first-class
 * night-mode toggle (not buried in a menu — see EditorShell.tsx's
 * `nightMode` state doc comment).
 */
export function EditorHeader({
  projectName,
  projectSlug,
  onClose,
  undo,
  redo,
  canUndo,
  canRedo,
  nightMode,
  onToggleNightMode,
  onReset,
  onSaveScene,
  configBusy,
  configLoaded,
  savedFlash,
  configError,
  onDetailPublish,
  canEditDetail,
  detailBusy,
  detailLoaded,
  activeVersion,
  t,
}: {
  projectName: string;
  projectSlug: string;
  onClose: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  nightMode: boolean;
  onToggleNightMode: () => void;
  onReset: () => void;
  onSaveScene: () => void;
  configBusy: boolean;
  configLoaded: boolean;
  savedFlash: boolean;
  configError: string | null;
  onDetailPublish: () => void;
  canEditDetail: boolean;
  detailBusy: boolean;
  detailLoaded: boolean;
  activeVersion: DetailVersionRow | null;
  t: Translate;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 px-5 py-3">
      <button
        onClick={onClose}
        aria-label={t("common.back")}
        className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold text-neutral-900">{projectName}</h1>
        <p className="text-xs text-neutral-500">{t("admin.viewer3DTitle")}</p>
      </div>

      {configError && <p className="shrink-0 text-xs font-medium text-red-600">{configError}</p>}
      {savedFlash && (
        <p className="shrink-0 rounded-control bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
          {t("admin.viewer3DSaved")}
        </p>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          aria-label={t("admin.editorUndo")}
          title={t("admin.editorUndo")}
          className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          aria-label={t("admin.editorRedo")}
          title={t("admin.editorRedo")}
          className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={onToggleNightMode}
        aria-label={t(nightMode ? "admin.editorLightMode" : "admin.editorNightMode")}
        title={t(nightMode ? "admin.editorLightMode" : "admin.editorNightMode")}
        className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
      >
        {nightMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <a
        href={`/project/${projectSlug}`}
        target="_blank"
        rel="noreferrer"
        className="flex shrink-0 items-center gap-1.5 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t("admin.editorPreviewExperience")}
      </a>

      <button
        onClick={onReset}
        disabled={configBusy}
        title={t("admin.viewer3DReset")}
        aria-label={t("admin.viewer3DReset")}
        className="shrink-0 rounded-control border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={onSaveScene}
        disabled={configBusy || !configLoaded}
        className="shrink-0 rounded-control border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
      >
        {t("admin.viewer3DSave")}
      </button>

      {activeVersion && (
        <button
          onClick={onDetailPublish}
          disabled={!canEditDetail || detailBusy || !detailLoaded || activeVersion.validationStatus === "blocked"}
          className="shrink-0 rounded-control bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          {t("admin.publish")}
        </button>
      )}
    </div>
  );
}
