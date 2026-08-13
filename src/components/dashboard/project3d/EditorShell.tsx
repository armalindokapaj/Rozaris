"use client";

import { useState, type RefObject } from "react";
import { ArrowLeft, ExternalLink, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { ThreeProjectViewer } from "@/components/project/ThreeProjectViewer";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import type {
  Locale,
  NodeOverride,
  PlatformHdri,
  Project,
  Project3DConfig,
  ProjectDetailModel,
  SceneManifestNode,
} from "@/lib/types";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { EDITOR_MODES, MODES_WITH_SCENE_RAIL, type EditorMode } from "./modes";
import type { SetOpts, Translate } from "./editorTypes";
import type { DetailVersionRow } from "./types";
import { ModeTabBar } from "./ModeTabBar";
import { SceneTreeRail } from "./SceneTreeRail";
import { ModelPanel } from "./panels/ModelPanel";
import { MaterialsPanel } from "./panels/MaterialsPanel";
import { LightingPanel } from "./panels/LightingPanel";
import { CameraPanel } from "./panels/CameraPanel";
import { UnitsPanel } from "./panels/UnitsPanel";
import { EffectsPanel } from "./panels/EffectsPanel";
import { ViewerPanel } from "./panels/ViewerPanel";

/**
 * Phase 2 editor shell — replaces Project3DConfigEditor.tsx's old single
 * scrolling `<div>` (was ~950 lines of inline JSX) with the master PRD's
 * viewport-first 7-mode layout: a persistent `<ThreeProjectViewer>`, a
 * mode-tab bar, the active mode's panel, and a persistent scene-tree rail
 * on the 3 modes where node selection is meaningful. Reset/Save Scene
 * stay global chrome (not per-tab) since one save persists fields spread
 * across every tab at once — same as the original single Save button.
 *
 * Milestone A of the Phase 2 plan: pure extraction, driven by the same
 * flat state Project3DConfigEditor.tsx already owned — no context, no
 * undo/redo, no autosave yet (those are Milestones B-D). Every prop below
 * is exactly what the original inline JSX read/wrote, just named instead
 * of closed-over.
 */
export function EditorShell({
  project,
  onClose,
  t,
  locale,
  draft,
  update,
  suggestedTier,
  advancedOpen,
  setAdvancedOpen,
  configBusy,
  configLoaded,
  configError,
  savedFlash,
  onReset,
  onSaveScene,
  undo,
  redo,
  canUndo,
  canRedo,
  autosaveStatus,
  autosaveError,
  onAutosaveRetry,
  viewerRef,
  previewDetailModel,
  platformHdris,
  hdriBusy,
  hdriError,
  hdriFileInputRef,
  onHdriUpload,
  onDeleteHdri,
  sunTimes,
  newPresetLabel,
  setNewPresetLabel,
  fileInputRef,
  onDetailFile,
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
  onDetailSave,
  onDetailPublish,
  detailLoaded,
  showHistory,
  setShowHistory,
  versions,
  onDetailRollback,
  onDeleteVersion,
  detectedNodes,
  nodesLoading,
  visibleNodes,
  showOnlyNeedsReview,
  setShowOnlyNeedsReview,
  linkSelections,
  setLinkSelections,
  carriedMeshNames,
  setCarriedMeshNames,
  sceneManifest,
  selectedNodeRzId,
  setSelectedNodeRzId,
  nodeOverrides,
  setNodeOverrides,
  linkedMeshNames,
}: {
  project: Project;
  onClose: () => void;
  t: Translate;
  locale: Locale;
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  suggestedTier: Project3DConfig["qualityPreset"];
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  configBusy: boolean;
  configLoaded: boolean;
  configError: string | null;
  savedFlash: boolean;
  onReset: () => void;
  onSaveScene: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  autosaveStatus: AutosaveStatus;
  autosaveError: string | null;
  autosaveLastSavedAt: string | null;
  onAutosaveRetry: () => void;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
  previewDetailModel: ProjectDetailModel | null;
  platformHdris: PlatformHdri[];
  hdriBusy: boolean;
  hdriError: string | null;
  hdriFileInputRef: RefObject<HTMLInputElement | null>;
  onHdriUpload: (file: File) => void;
  onDeleteHdri: (hdri: PlatformHdri) => void;
  sunTimes: { sunriseHourUTC: number; sunsetHourUTC: number } | null;
  newPresetLabel: string;
  setNewPresetLabel: (v: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDetailFile: (file: File) => void;
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
  onDetailSave: () => void;
  onDetailPublish: () => void;
  detailLoaded: boolean;
  showHistory: boolean;
  setShowHistory: (v: boolean | ((prev: boolean) => boolean)) => void;
  versions: DetailVersionRow[];
  onDetailRollback: (versionId: string) => void;
  onDeleteVersion: (version: DetailVersionRow) => void;
  detectedNodes: string[] | null;
  nodesLoading: boolean;
  visibleNodes: string[];
  showOnlyNeedsReview: boolean;
  setShowOnlyNeedsReview: (v: boolean | ((prev: boolean) => boolean)) => void;
  linkSelections: Record<string, string>;
  setLinkSelections: (
    v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
    opts?: SetOpts
  ) => void;
  carriedMeshNames: Set<string>;
  setCarriedMeshNames: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  sceneManifest: SceneManifestNode[];
  selectedNodeRzId: string | null;
  setSelectedNodeRzId: (id: string | null) => void;
  nodeOverrides: Record<string, NodeOverride>;
  setNodeOverrides: (
    v: Record<string, NodeOverride> | ((prev: Record<string, NodeOverride>) => Record<string, NodeOverride>),
    opts?: SetOpts
  ) => void;
  linkedMeshNames: Set<string>;
}) {
  const [activeMode, setActiveMode] = useState<EditorMode>("model");

  return (
    <div className="flex h-full min-h-0 w-full flex-col lg:flex-row">
      <div className="h-64 shrink-0 bg-neutral-900 lg:h-full lg:flex-1">
        <ThreeProjectViewer
          ref={viewerRef}
          project={project}
          config={draft}
          detailModel={previewDetailModel}
          hdriUrl={platformHdris.find((h) => h.id === draft.hdriId)?.url ?? null}
          showChrome={false}
          showPerfStats
        />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col border-t border-neutral-100 lg:h-full lg:max-w-md lg:border-l lg:border-t-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-5 py-4">
          <button
            onClick={onClose}
            aria-label={t("common.back")}
            className="shrink-0 rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-neutral-900">{t("admin.viewer3DTitle")}</h2>
            <p className="truncate text-xs text-neutral-500">{project.name}</p>
          </div>
          {/* Step 4 of the MVP admin pipe ("Create → Upload → Configure →
              Preview") — opens exactly what a customer sees. Real public
              route; a freshly admin-created project resolves there via
              CustomProjectPreview.tsx's client-side Zustand fallback (see
              "rozaris-mvp-admin-project-pipe" memory) since it isn't in the
              static mockData catalog. */}
          <a
            href={`/project/${project.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-control border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("admin.editorPreviewExperience")}
          </a>
          {/* Undo/redo (Phase 2, Milestone C) — act across all 7 tabs at
              once, since the underlying history covers the whole editable
              snapshot, not a per-tab slice; global header is the natural
              home rather than duplicating on every panel. */}
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
        </div>

        {/* Autosave status (Milestone D) — one combined pill for both
            background instances (config + detail-model); Publish is never
            reflected here since it's never autosaved. */}
        <div className="flex shrink-0 items-center gap-2 border-b border-neutral-100 px-5 py-2 text-[11px]">
          {autosaveStatus === "saving" && <span className="text-neutral-500">{t("admin.autosaveSaving")}</span>}
          {autosaveStatus === "saved" && (
            // `formatRelativeDate` is day-granularity (built for version
            // history timestamps) — "Saved Today" right after a save reads
            // stranger than just "Saved," so the timestamp isn't shown
            // here despite `autosaveLastSavedAt` being tracked precisely;
            // kept in the prop/hook for whoever wants a finer-grained
            // "Saved Xs ago" formatter later.
            <span className="text-neutral-400">{t("admin.autosaveSaved")}</span>
          )}
          {autosaveStatus === "error" && (
            <>
              <span className="font-medium text-red-600">{autosaveError || t("admin.autosaveError")}</span>
              <button onClick={onAutosaveRetry} className="font-semibold text-red-600 underline hover:text-red-700">
                {t("admin.autosaveRetry")}
              </button>
            </>
          )}
          {autosaveStatus === "idle" && <span className="text-neutral-300">{t("admin.autosaveIdle")}</span>}
        </div>

        <ModeTabBar active={activeMode} onChange={setActiveMode} t={t} />

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin p-5">
          {activeMode === "model" && (
            <ModelPanel
              fileInputRef={fileInputRef}
              onFile={onDetailFile}
              hasDetailModel={hasDetailModel}
              activeVersion={activeVersion}
              canEditDetail={canEditDetail}
              detailBusy={detailBusy}
              onDiscardDraft={onDiscardDraft}
              onRemoveDetailModel={onRemoveDetailModel}
              onDeleteModel={onDeleteModel}
              uploadProgress={uploadProgress}
              detailError={detailError}
              scale={scale}
              setScale={setScale}
              rotationDeg={rotationDeg}
              setRotationDeg={setRotationDeg}
              altitudeOffset={altitudeOffset}
              setAltitudeOffset={setAltitudeOffset}
              detailFlash={detailFlash}
              needsReviewCount={needsReviewCount}
              matchedCount={matchedCount}
              nodeOverrideCount={Object.keys(nodeOverrides).length}
              onDetailSave={onDetailSave}
              onDetailPublish={onDetailPublish}
              detailLoaded={detailLoaded}
              showHistory={showHistory}
              setShowHistory={setShowHistory}
              versions={versions}
              onDetailRollback={onDetailRollback}
              onDeleteVersion={onDeleteVersion}
              locale={locale}
              t={t}
            />
          )}
          {activeMode === "materials" && <MaterialsPanel draft={draft} update={update} t={t} />}
          {activeMode === "lighting" && (
            <LightingPanel
              draft={draft}
              update={update}
              platformHdris={platformHdris}
              hdriBusy={hdriBusy}
              hdriError={hdriError}
              hdriFileInputRef={hdriFileInputRef}
              onHdriUpload={onHdriUpload}
              onDeleteHdri={onDeleteHdri}
              sunTimes={sunTimes}
              t={t}
            />
          )}
          {activeMode === "camera" && (
            <CameraPanel
              draft={draft}
              update={update}
              viewerRef={viewerRef}
              newPresetLabel={newPresetLabel}
              setNewPresetLabel={setNewPresetLabel}
              t={t}
            />
          )}
          {activeMode === "units" && (
            <UnitsPanel
              units={project.units}
              detectedNodes={detectedNodes}
              nodesLoading={nodesLoading}
              matchedCount={matchedCount}
              needsReviewCount={needsReviewCount}
              visibleNodes={visibleNodes}
              showOnlyNeedsReview={showOnlyNeedsReview}
              setShowOnlyNeedsReview={setShowOnlyNeedsReview}
              canEditDetail={canEditDetail}
              linkSelections={linkSelections}
              setLinkSelections={setLinkSelections}
              carriedMeshNames={carriedMeshNames}
              setCarriedMeshNames={setCarriedMeshNames}
              draft={draft}
              update={update}
              t={t}
            />
          )}
          {activeMode === "effects" && (
            <EffectsPanel
              draft={draft}
              update={update}
              suggestedTier={suggestedTier}
              advancedOpen={advancedOpen}
              setAdvancedOpen={setAdvancedOpen}
              t={t}
            />
          )}
          {activeMode === "viewer" && <ViewerPanel draft={draft} update={update} t={t} />}

          {MODES_WITH_SCENE_RAIL.has(activeMode) && hasDetailModel && sceneManifest.length > 0 && (
            <div className="border-t border-neutral-100 pt-5">
              <SceneTreeRail
                sceneManifest={sceneManifest}
                selectedNodeRzId={selectedNodeRzId}
                setSelectedNodeRzId={setSelectedNodeRzId}
                nodeOverrides={nodeOverrides}
                setNodeOverrides={setNodeOverrides}
                linkedMeshNames={linkedMeshNames}
                canEditDetail={canEditDetail}
                t={t}
              />
            </div>
          )}
        </div>

        {/* Global chrome: Reset/Save Scene act on the whole `draft` object,
            which spans fields from several tabs at once (rendering,
            lighting, camera, glass, viewer UI) — kept outside the per-tab
            panels rather than duplicated on each one, same as the
            original single Save button. */}
        <div className="shrink-0 space-y-2 border-t border-neutral-100 p-5">
          <div className="flex gap-2">
            <button
              onClick={onReset}
              disabled={configBusy}
              className="flex items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("admin.viewer3DReset")}
            </button>
            <button
              onClick={onSaveScene}
              disabled={configBusy || !configLoaded}
              className="flex-1 rounded-control bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              {t("admin.viewer3DSave")}
            </button>
          </div>
          {savedFlash && (
            <p className="rounded-control bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
              {t("admin.viewer3DSaved")}
            </p>
          )}
          {configError && <p className="text-xs font-medium text-red-600">{configError}</p>}
        </div>
      </div>
    </div>
  );
}

// Re-exported so callers don't need a separate import from ./modes just to
// name a mode (e.g. for a future deep-link like ?mode=materials).
export { EDITOR_MODES };
export type { EditorMode };
