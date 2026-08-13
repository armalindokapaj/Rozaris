"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ThreeProjectViewer } from "@/components/project/ThreeProjectViewer";
import type { SectionGizmoMode, ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import type {
  DetailModelSlot,
  Locale,
  NodeOverride,
  PlatformHdri,
  Project,
  Project3DConfig,
  ProjectDetailModel,
  SceneManifestNode,
  Section,
} from "@/lib/types";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { cn } from "@/lib/utils";
import { EDITOR_MODES, type EditorMode } from "./modes";
import type { FloorFilter, PreviewWidth, SetOpts, Translate } from "./editorTypes";
import type { DetailVersionRow } from "./types";
import { EditorHeader } from "./EditorHeader";
import { ModeTabBar } from "./ModeTabBar";
import { BuildingNavRail } from "./BuildingNavRail";
import { SceneTreeRail } from "./SceneTreeRail";
import { SectionsListRail } from "./SectionsListRail";
import { SlotTabStrip } from "./SlotTabStrip";
import { SunTimeOverlay } from "./SunTimeOverlay";
import { EditorStatusBar } from "./EditorStatusBar";
import { ModelPanel } from "./panels/ModelPanel";
import { MaterialsPanel } from "./panels/MaterialsPanel";
import { LightingPanel } from "./panels/LightingPanel";
import { CameraPanel } from "./panels/CameraPanel";
import { UnitsPanel } from "./panels/UnitsPanel";
import { SectionsPanel } from "./panels/SectionsPanel";
import { EffectsPanel } from "./panels/EffectsPanel";
import { ViewerPanel } from "./panels/ViewerPanel";

const THEME_STORAGE_KEY = "rz-editor-theme";

const PREVIEW_WIDTH_STYLE: Record<PreviewWidth, string | undefined> = {
  desktop: undefined,
  tablet: "768px",
  mobile: "390px",
};

/**
 * Editor shell — replaces Project3DConfigEditor.tsx's old single scrolling
 * `<div>` (was ~950 lines of inline JSX). As of the 2026-08-13
 * Inventory/Floors mockup pass, the layout matches a user-supplied
 * screenshot of that mockup's own Inventory screen: a full-width
 * `EditorHeader` (back/title/undo-redo/night-mode/Preview/Reset/Save/
 * Publish), a full-width `ModeTabBar` (7 tabs — "Inventory" is back, see
 * modes.ts), a 3-column body (`BuildingNavRail` — building/floor
 * navigation only, real `Unit.buildingName`/`Unit.floor` grouping — /
 * viewport / the active tab's settings panel), and a full-width
 * `EditorStatusBar`. The Materials tab also renders `SceneTreeRail`
 * (mesh tree + per-node overrides) above `MaterialsPanel` — it moved out
 * of the old permanent left panel now that the left rail is
 * building-only, and `MaterialsPanel` was always meant to be shown
 * alongside it (see that file's own doc comment).
 *
 * `nightMode` is new: default light (matching the rest of the platform),
 * toggled from the header, persisted to `localStorage`. `.rz-editor-dark`
 * (globals.css, from the prior always-on dark redesign) is now applied
 * conditionally to this whole wrapper instead of hardcoded on two
 * columns — the 3D canvas itself stays permanently dark either way, same
 * as every other viewer in the app.
 *
 * Originally built (Milestone A of the Phase 2 plan) as a pure extraction
 * driven by the same flat state Project3DConfigEditor.tsx already owned —
 * every data/mutation prop below is exactly what the original inline JSX
 * read/wrote, just named instead of closed-over; undo/redo, autosave, the
 * 3-column relayout, the dark theme, and this Inventory/Floors layout all
 * came later.
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
  previewDetailModels,
  slots,
  activeSlotId,
  onSelectSlot,
  onAddSlot,
  onRenameSlot,
  onDeleteSlot,
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
  previewDetailModels: { slotId: string; model: ProjectDetailModel }[];
  slots: DetailModelSlot[];
  activeSlotId: string | null;
  onSelectSlot: (id: string) => void;
  onAddSlot: (name: string) => void;
  onRenameSlot: (id: string, name: string) => void;
  onDeleteSlot: (id: string) => void;
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
  const [perfStats, setPerfStats] = useState<{ fps: number; drawCalls: number; triangles: number; dpr: number } | null>(
    null
  );
  // Left rail selection (Inventory/Floors mockup pass) — threaded into the
  // Inventory tab for real filtering; see editorTypes.ts's FloorFilter doc.
  const [selectedFloor, setSelectedFloor] = useState<FloorFilter | null>(null);
  // Bottom bar's device-preview toggle — real, constrains the viewport
  // column below.
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  // Night mode — default light (matches the rest of the platform), opt-in,
  // persisted per-browser. Read from localStorage in an effect (not at
  // render time) since this component's initial render also happens
  // server-side and `window` isn't available there.
  const [nightMode, setNightMode] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNightMode(window.localStorage.getItem(THEME_STORAGE_KEY) === "dark");
  }, []);
  function toggleNightMode() {
    setNightMode((v) => {
      const next = !v;
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }

  const hasSceneTree = hasDetailModel && sceneManifest.length > 0;

  // --- Sections module (first-class Configurator module) ---
  const sections = draft.sections;
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<SectionGizmoMode>("move");
  const [drawingSection, setDrawingSection] = useState(false);
  // Mirrors RenderEngine's live gizmo-drag transform (see
  // RenderEngineCallbacks.onSectionDraftChange) so SectionsPanel's fields
  // update in real time without waiting for a draft/update round trip —
  // cleared once a field edit or a fresh selection supersedes it.
  const [liveSectionOverride, setLiveSectionOverride] = useState<Section | null>(null);
  const [cameraSavedFlash, setCameraSavedFlash] = useState(false);
  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;
  const displaySection = liveSectionOverride ?? selectedSection;

  // Real bug audit (user report: "every option in Sections breaks the
  // panel, nothing works") — two fixes live here:
  //  1. `attachSectionGizmo` used to be called synchronously, unguarded,
  //     on every single field edit (every keystroke in Name, every tick
  //     of a slider drag). Each call rebuilds the live clip planes + cap
  //     mesh — real WebGPU resource churn, dozens of times a second
  //     during a drag. `syncSectionGizmo` below debounces that down to a
  //     few calls a second instead of one per tick.
  //  2. Whatever the render engine does with that call is unverifiable in
  //     this environment (no browser tool here — same standing caveat as
  //     the rest of this session's rendering work). If it throws, an
  //     uncaught exception from inside a React onChange handler takes the
  //     whole panel down with it — the exact "nothing works" symptom
  //     reported. Wrapping it in try/catch means a render-engine failure
  //     can no longer do that: editing/saving stays usable even if the
  //     live 3D preview hiccups.
  const sectionGizmoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (sectionGizmoSyncTimerRef.current != null) clearTimeout(sectionGizmoSyncTimerRef.current);
    },
    []
  );
  function syncSectionGizmo(section: Section, mode: SectionGizmoMode, opts?: { debounce?: boolean }) {
    if (sectionGizmoSyncTimerRef.current != null) {
      clearTimeout(sectionGizmoSyncTimerRef.current);
      sectionGizmoSyncTimerRef.current = null;
    }
    const run = () => {
      try {
        viewerRef.current?.attachSectionGizmo(section, mode);
      } catch (err) {
        console.error("Sections: failed to sync the live gizmo/clip preview (edit itself is unaffected)", err);
      }
    };
    if (opts?.debounce) {
      sectionGizmoSyncTimerRef.current = setTimeout(run, 100);
    } else {
      run();
    }
  }

  // Leaving the Sections tab always returns the viewer to its normal,
  // unclipped state — browsing Materials/Lighting/etc. shouldn't leave a
  // stale cut applied. Also covers the very first render (activeMode
  // starts as "model"), where every call below is a harmless no-op since
  // nothing is attached yet.
  useEffect(() => {
    if (activeMode !== "sections") {
      try {
        viewerRef.current?.cancelDrawSection();
        viewerRef.current?.detachSectionGizmo();
        viewerRef.current?.activateSection(null);
      } catch (err) {
        console.error("Sections: failed to clear the live preview on tab switch", err);
      }
      // Synchronizing React's "which section is selected" state with the
      // tab switch above (an external-ish concern — it also drives the
      // imperative viewer calls right above) — same justified case as the
      // nightMode initial-load effect elsewhere in this file.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSectionId(null);
      setLiveSectionOverride(null);
      setDrawingSection(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  function handleSelectSection(id: string) {
    setSelectedSectionId(id);
    setLiveSectionOverride(null);
    const section = sections.find((s) => s.id === id);
    if (section) syncSectionGizmo(section, gizmoMode);
  }

  function handleDrawSection() {
    if (drawingSection) {
      viewerRef.current?.cancelDrawSection();
      setDrawingSection(false);
      return;
    }
    setDrawingSection(true);
    const buildingName = selectedFloor?.building;
    viewerRef.current?.beginDrawSection(
      {
        id: `section-${Date.now()}`,
        name: t("admin.sectionDefaultName", { n: sections.length + 1 }),
        scope: buildingName ? "building" : "project",
        buildingName,
      },
      (section) => {
        update({ sections: [...sections, section] }, { commit: true });
        setDrawingSection(false);
        setSelectedSectionId(section.id);
        setGizmoMode("move");
        syncSectionGizmo(section, "move");
      }
    );
  }

  function handleGizmoModeChange(mode: SectionGizmoMode) {
    setGizmoMode(mode);
    try {
      viewerRef.current?.setSectionGizmoMode(mode);
    } catch (err) {
      console.error("Sections: failed to switch the gizmo mode", err);
    }
  }

  // `opts` (real fix, not previously exposed here) — mirrors every other
  // panel's convention (see useProject3DEditorState.ts's own doc comment):
  // a slider drag or fast typing should pass `{ commit: false }` so
  // useUndoRedo coalesces the burst into one undo step instead of one per
  // tick; a discrete control (toggle/select/color/blur-commit text)
  // passes `{ commit: true }`. Defaults to `commit: true` so existing
  // callers (handleSetSectionCamera below) that don't pass opts keep
  // behaving exactly as before.
  function handleUpdateSection(partial: Partial<Section>, opts?: SetOpts) {
    if (!selectedSectionId) return;
    const next = sections.map((s) => (s.id === selectedSectionId ? { ...s, ...partial } : s));
    update({ sections: next }, opts ?? { commit: true });
    setLiveSectionOverride(null);
    const updated = next.find((s) => s.id === selectedSectionId);
    // Debounced — this is the hot path (every keystroke/slider tick), see
    // syncSectionGizmo's own doc comment above for why.
    if (updated) syncSectionGizmo(updated, gizmoMode, { debounce: true });
  }

  // Real save bug fix (Sections audit, 2026-08-13): fired once per gizmo
  // drag, on release (`RenderEngineCallbacks.onSectionDraftCommit`, wired
  // below via `onSectionDraftCommit` on `<ThreeProjectViewer>`) — this is
  // the ONLY place a Move/Rotate/Resize/Height gizmo edit actually reaches
  // `draft.sections`. Previously nothing did: `onSectionDraftChange`
  // (below, still real, still needed) only ever updated
  // `liveSectionOverride`, a purely-visual display value the panel reads
  // while dragging — so a gizmo-edited section looked right on screen and
  // in the panel's own numbers, but Save/autosave PATCHed the *pre-drag*
  // section every time, since `draft.sections` itself never changed. A
  // drag-end is one discrete, undo-worthy edit — `commit: true`, matching
  // every other panel's discrete-control convention.
  function handleSectionDraftCommit(section: Section) {
    setLiveSectionOverride(null);
    update(
      { sections: sections.map((s) => (s.id === section.id ? section : s)) },
      { commit: true }
    );
  }

  function handleDuplicateSection(section: Section) {
    const copy: Section = { ...section, id: `section-${Date.now()}`, name: `${section.name} 2` };
    update({ sections: [...sections, copy] }, { commit: true });
    setSelectedSectionId(copy.id);
    setLiveSectionOverride(null);
    syncSectionGizmo(copy, gizmoMode);
  }

  function handleRenameSection(id: string, name: string) {
    update({ sections: sections.map((s) => (s.id === id ? { ...s, name } : s)) }, { commit: true });
    // The rail's own rename doesn't otherwise touch the viewer — but if
    // the renamed section is the one currently attached, keep its live
    // preview's `liveSection.name` in sync too (harmless no-op cost-wise,
    // avoids a stale name if the admin reopens the panel mid-edit).
    if (id === selectedSectionId) {
      const updated = sections.find((s) => s.id === id);
      if (updated) syncSectionGizmo({ ...updated, name }, gizmoMode, { debounce: true });
    }
  }

  function handleToggleHiddenSection(id: string) {
    update({ sections: sections.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)) }, { commit: true });
  }

  function handleDeleteSection(id: string) {
    update({ sections: sections.filter((s) => s.id !== id) }, { commit: true });
    if (selectedSectionId === id) {
      setSelectedSectionId(null);
      setLiveSectionOverride(null);
      try {
        viewerRef.current?.detachSectionGizmo();
        viewerRef.current?.activateSection(null);
      } catch (err) {
        console.error("Sections: failed to clear the live gizmo/clip preview after delete", err);
      }
    }
  }

  function handleSetSectionCamera() {
    if (!selectedSectionId) return;
    const state = viewerRef.current?.getCameraState();
    if (!state) return;
    handleUpdateSection({ cameraPreset: state }, { commit: true });
    setCameraSavedFlash(true);
    setTimeout(() => setCameraSavedFlash(false), 2000);
  }

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", nightMode && "rz-editor-dark")}>
      <EditorHeader
        projectName={project.name}
        projectSlug={project.slug}
        onClose={onClose}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        nightMode={nightMode}
        onToggleNightMode={toggleNightMode}
        onReset={onReset}
        onSaveScene={onSaveScene}
        configBusy={configBusy}
        configLoaded={configLoaded}
        savedFlash={savedFlash}
        configError={configError}
        onDetailPublish={onDetailPublish}
        canEditDetail={canEditDetail}
        detailBusy={detailBusy}
        detailLoaded={detailLoaded}
        activeVersion={activeVersion}
        t={t}
      />
      <ModeTabBar active={activeMode} onChange={setActiveMode} t={t} />

      {/* 3-column body: building/floor nav (left) / viewport (middle) /
          active tab's settings (right). `order-*` keeps the viewport
          visually first on a stacked mobile layout, `lg:order-*` restores
          true left/middle/right on desktop — same technique as the prior
          3-column pass. */}
      <div className="flex flex-1 min-h-0 w-full flex-col lg:flex-row">
        {/* LEFT — building/floor navigation, except the Sections tab
            (first-class Configurator module), which uses this space for
            the sections list + "+ Draw Section" instead — see
            SectionsListRail.tsx's own doc comment. */}
        <div className="order-2 flex min-h-0 w-full shrink-0 flex-col border-b border-neutral-200 lg:order-1 lg:h-full lg:w-1/4 lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-5">
            {activeMode === "sections" ? (
              <SectionsListRail
                sections={sections}
                selectedSectionId={selectedSectionId}
                onSelect={handleSelectSection}
                onDrawNew={handleDrawSection}
                drawing={drawingSection}
                onDuplicate={handleDuplicateSection}
                onRename={handleRenameSection}
                onToggleHidden={handleToggleHiddenSection}
                onDelete={handleDeleteSection}
                t={t}
              />
            ) : (
              <BuildingNavRail units={project.units} selectedFloor={selectedFloor} setSelectedFloor={setSelectedFloor} t={t} />
            )}
          </div>
        </div>

        {/* MIDDLE — viewport. `previewWidth` constrains it to simulate a
            tablet/mobile breakpoint (real — not a stub). */}
        <div className="relative order-1 flex h-64 shrink-0 items-stretch justify-center bg-neutral-900 lg:order-2 lg:h-full lg:flex-1">
          <div
            className="relative h-full w-full"
            style={previewWidth === "desktop" ? undefined : { maxWidth: PREVIEW_WIDTH_STYLE[previewWidth] }}
          >
            <ThreeProjectViewer
              ref={viewerRef}
              project={project}
              config={draft}
              detailModels={previewDetailModels}
              hdriUrl={platformHdris.find((h) => h.id === draft.hdriId)?.url ?? null}
              showChrome={false}
              showPerfStats
              onPerfStats={setPerfStats}
              onSectionDraftChange={(section) => {
                if (section.id === selectedSectionId) setLiveSectionOverride(section);
              }}
              onSectionDraftCommit={handleSectionDraftCommit}
            />
            {/* Live Sun & Time scrubber — Lighting-tab-only, see
                SunTimeOverlay.tsx's own doc comment for why it's scoped
                here rather than a global header shortcut. */}
            {activeMode === "lighting" && (
              <SunTimeOverlay draft={draft} update={update} sunTimes={sunTimes} t={t} />
            )}
          </div>
        </div>

        {/* RIGHT — settings for the active top tab. */}
        <div className="order-3 flex min-h-0 w-full shrink-0 flex-col border-t border-neutral-200 lg:h-full lg:w-1/4 lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin p-5">
            {activeMode === "model" && (
              <>
                <SlotTabStrip
                  slots={slots}
                  activeSlotId={activeSlotId}
                  onSelect={onSelectSlot}
                  onAdd={onAddSlot}
                  onRename={onRenameSlot}
                  onDelete={onDeleteSlot}
                  t={t}
                />
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
                  detailLoaded={detailLoaded}
                  showHistory={showHistory}
                  setShowHistory={setShowHistory}
                  versions={versions}
                  onDetailRollback={onDetailRollback}
                  onDeleteVersion={onDeleteVersion}
                  locale={locale}
                  t={t}
                />
              </>
            )}
            {activeMode === "materials" && (
              <div className="space-y-5">
                {hasSceneTree && (
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
                )}
                <div className={hasSceneTree ? "border-t border-neutral-100 pt-5" : undefined}>
                  <MaterialsPanel draft={draft} update={update} t={t} />
                </div>
              </div>
            )}
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
            {activeMode === "sections" &&
              (displaySection ? (
                <SectionsPanel
                  section={displaySection}
                  update={handleUpdateSection}
                  gizmoMode={gizmoMode}
                  setGizmoMode={handleGizmoModeChange}
                  onSetCamera={handleSetSectionCamera}
                  cameraSaved={cameraSavedFlash}
                  onSave={onSaveScene}
                  saveBusy={configBusy}
                  savedFlash={savedFlash}
                  saveError={configError}
                  t={t}
                />
              ) : (
                <p className="text-xs text-neutral-400">{t("admin.sectionsSelectPrompt")}</p>
              ))}
            {activeMode === "inventory" && (
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
                selectedFloor={selectedFloor}
                setSelectedFloor={setSelectedFloor}
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
                perfStats={perfStats}
                t={t}
              />
            )}
            {activeMode === "viewer" && <ViewerPanel draft={draft} update={update} t={t} />}
          </div>
        </div>
      </div>

      <EditorStatusBar
        autosaveStatus={autosaveStatus}
        autosaveError={autosaveError}
        onAutosaveRetry={onAutosaveRetry}
        perfStats={perfStats}
        qualityPreset={draft.qualityPreset}
        onQualityPresetChange={(v) => update({ qualityPreset: v }, { commit: true })}
        previewWidth={previewWidth}
        onPreviewWidthChange={setPreviewWidth}
        t={t}
      />
    </div>
  );
}

// Re-exported so callers don't need a separate import from ./modes just to
// name a mode (e.g. for a future deep-link like ?mode=materials).
export { EDITOR_MODES };
export type { EditorMode };
