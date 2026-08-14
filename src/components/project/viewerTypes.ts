import type { Project, Project3DConfig, ProjectDetailModel, Section, Unit } from "@/lib/types";

export type SectionGizmoMode = "move" | "rotate" | "resize" | "height";

/** Shared imperative handle + props contract between ThreeProjectViewer.tsx
 * (a thin re-export) and ProceduralProjectViewer.tsx (the real engine) —
 * kept in its own module so neither needs to import the other just for a
 * type. */
export interface ThreeProjectViewerHandle {
  /** PRD §7.1/§16 — "Reset returns to Admin-saved starting camera." */
  resetView: () => void;
  /** Captures the current WebGL frame as a PNG data URL — null if the
   * renderer isn't ready (e.g. WebGL failed to init). */
  captureScreenshot: () => string | null;
  /** "Render this" — a real, separate photorealistic path-traced
   * screenshot (`webgl_renderer_pathtracer.html` parity, see
   * RenderEngine.ts's renderPathTraceScreenshot doc comment for the full
   * scope) — distinct from `captureScreenshot` above, which just grabs
   * whatever's already on screen. Async and slow by design (accumulates
   * real samples for `durationMs`, default 10s); null if the renderer
   * isn't ready. */
  renderPathTraceScreenshot: (durationMs?: number) => Promise<string | null>;
  /** The live preview's current camera position/target/fov — null if the
   * renderer isn't ready. Used by Project3DConfigEditor's "Save current
   * view" camera-preset button (Render/visual quality pass). */
  getCameraState: () => { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number } | null;
  /** Sections module — real editor-authoring entry points. Only
   * `EditorShell.tsx` (admin) calls these; public-viewer usages never do.
   * `beginDrawSection`'s `onComplete` fires once with a new, unsaved
   * `Section` once the two viewport clicks land — the caller owns adding
   * it to `draft.sections`. */
  beginDrawSection: (
    opts: { id: string; name: string; scope: Section["scope"]; buildingName?: string },
    onComplete: (section: Section) => void
  ) => void;
  cancelDrawSection: () => void;
  attachSectionGizmo: (section: Section, mode: SectionGizmoMode) => void;
  setSectionGizmoMode: (mode: SectionGizmoMode) => void;
  detachSectionGizmo: () => void;
  getLiveSectionDraft: () => Section | null;
  /** Real for both the admin editor (live-previewing while editing) and
   * the public runtime (a visitor activating a floor from the
   * bottom-chrome Sections panel) — clips + shows the section's cap;
   * `null` clears it. */
  activateSection: (sectionId: string | null) => void;
}

export interface ThreeProjectViewerProps {
  project: Project;
  config: Project3DConfig;
  /** Every admin-uploaded detailed GLB slot ("Building", "Surroundings",
   * ... — Multiple Detail-Model Slots pass), empty if none enabled yet —
   * caller-supplied, not fetched internally, so both real callers control
   * their own source: the public page uses `useProjectDetailModel` (each
   * slot's published version, unchanged fetch); the Admin editor's live
   * preview supplies its own array built from the currently active
   * draft/published version of whichever slot is selected plus every
   * in-progress slider/link/override edit, so the preview never lags
   * behind unsaved changes. Mirrors how `config` above already works —
   * no internal fetch there either. */
  detailModels: { slotId: string; model: ProjectDetailModel }[];
  /** Resolved URL of `config.hdriId`'s shared PlatformHdri row, or `null`
   * if none is selected (or it failed to resolve) — the engine loads and
   * uses it in place of the procedural sky gradient. Caller-resolved for
   * the same reason `detailModels` is: both real callers already fetch
   * their own copy of the platform HDRI list (usePlatformHdris) and
   * resolve `config.hdriId` against it, so the engine itself doesn't need
   * its own network fetch just to look up one URL. */
  hdriUrl?: string | null;
  className?: string;
  selectedUnitId?: string | null;
  onSelectUnit?: (unit: Unit) => void;
  /** Public viewer chrome (bottom icon menu) is on by default; the Admin
   * live-preview embed turns it off to keep the form the only UI. */
  showChrome?: boolean;
  /** Fires whenever the bottom menu's Unit Search / Time of Day panel is
   * expanded/collapsed, so a parent floating its own chrome (e.g.
   * ArchVizClient's construction-progress pill) can react instead of
   * guessing whether extra bottom-of-viewport height is in use. */
  onBarOpenChange?: (open: boolean) => void;
  /** Fires whenever the bottom menu's "Unit Search" panel specifically
   * (not Time of Day/Camera Presets/Sections) opens or closes — narrower
   * than `onBarOpenChange` above. Availability/unit-box color/legend and
   * the unit-details popup are only meant to be visible while Unit Search
   * is the active panel: switching to Home (which only shows once no
   * panel is open) or Time of Day, or closing Unit Search outright, all
   * report `false` here so a parent (ArchVizClient's selected-unit popup)
   * can hide/clear along with them instead of lingering. */
  onUnitSearchActiveChange?: (active: boolean) => void;
  /** Admin-only debug overlay (FPS/draw calls/triangles/DPR) — Publish/
   * runtime hardening pass. Deliberately separate from `showChrome`
   * (public visitor chrome vs. an admin debug tool are different
   * concerns): off by default, Project3DConfigEditor's preview turns it
   * on. */
  showPerfStats?: boolean;
  /** Real shadow-map debug HUD (`webgl_shadowmap_viewer.html` parity) —
   * shows exactly what the sun's real shadow map contains, overlaid in a
   * corner. Not a `Project3DConfig` field (same "not persisted, session-
   * only" category as `showPerfStats`); only wired up on the public
   * viewer (ArchVizClient.tsx, hidden behind a `?debugShadowMap=1` query
   * param, not a visible button real visitors would see) — see
   * RenderEngine.ts's `shadowMapViewer` field doc comment for why it's
   * scoped to a full-viewport context specifically. */
  showShadowMapViewer?: boolean;
  /** Mirrors the same 4 fields the built-in perf overlay already shows
   * (fps/drawCalls/triangles/dpr) — when supplied, the caller is
   * rendering its own perf display, so the internal floating overlay is
   * suppressed to avoid showing it twice. Added for the dark-theme
   * configurator restyle's right-rail "Performance Overview" card; the
   * underlying tracking (RenderEngine.ts's samplePerfStats) is unchanged,
   * this only adds a second place the same numbers can be read from. */
  onPerfStats?: (stats: { fps: number; drawCalls: number; triangles: number; dpr: number } | null) => void;
  /** Sections module — fires continuously while a section gizmo is being
   * dragged in the admin editor, mirroring
   * `RenderEngineCallbacks.onSectionDraftChange`. Public-viewer usages
   * never supply this (nothing there drags a gizmo). */
  onSectionDraftChange?: (section: Section) => void;
  /** Sections module — fires once per gizmo drag, on release, mirroring
   * `RenderEngineCallbacks.onSectionDraftCommit`. This is the one that
   * must write into `draft.sections` (real save bug fix, 2026-08-13) —
   * `onSectionDraftChange` above is display-only. Public-viewer usages
   * never supply this. */
  onSectionDraftCommit?: (section: Section) => void;
}
