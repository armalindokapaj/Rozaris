import type { Project, Project3DConfig, ProjectDetailModel, Unit } from "@/lib/types";
import type { ViewPreset } from "@/lib/viewerPresets";

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
  /** The live preview's current camera position/target/fov — null if the
   * renderer isn't ready. Used by Project3DConfigEditor's "Save current
   * view" camera-preset button (Render/visual quality pass). */
  getCameraState: () => { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number } | null;
}

export interface ThreeProjectViewerProps {
  project: Project;
  config: Project3DConfig;
  /** The admin-uploaded detailed GLB (or `null` if none/not enabled) —
   * caller-supplied, not fetched internally, so both real callers control
   * their own source: the public page uses `useProjectDetailModel` (the
   * published version, unchanged); the Admin editor's live preview
   * supplies its own object built from the currently active draft/
   * published version plus every in-progress slider/link/override edit,
   * so the preview never lags behind unsaved changes. Mirrors how `config`
   * above already works — no internal fetch there either. */
  detailModel: ProjectDetailModel | null;
  /** Resolved URL of `config.hdriId`'s shared PlatformHdri row, or `null`
   * if none is selected (or it failed to resolve) — the engine loads and
   * uses it in place of the procedural sky gradient. Caller-resolved for
   * the same reason `detailModel` is: both real callers already fetch
   * their own copy of the platform HDRI list (usePlatformHdris) and
   * resolve `config.hdriId` against it, so the engine itself doesn't need
   * its own network fetch just to look up one URL. */
  hdriUrl?: string | null;
  className?: string;
  selectedUnitId?: string | null;
  onSelectUnit?: (unit: Unit) => void;
  /** Live construction completion (0-100) — defaults to the project's own
   * seeded value; the Admin preview can override it while scrubbing. */
  constructionProgressPercent?: number;
  /** Public viewer chrome (bottom icon menu) is on by default; the Admin
   * live-preview embed turns it off to keep the form the only UI. */
  showChrome?: boolean;
  /** Fires whenever the bottom menu's Unit Search / Time of Day panel is
   * expanded/collapsed, so a parent floating its own chrome (e.g.
   * ArchVizClient's construction-progress pill) can react instead of
   * guessing whether extra bottom-of-viewport height is in use. */
  onBarOpenChange?: (open: boolean) => void;
  /** Admin-only debug overlay (FPS/draw calls/triangles/DPR) — Publish/
   * runtime hardening pass. Deliberately separate from `showChrome`
   * (public visitor chrome vs. an admin debug tool are different
   * concerns): off by default, Project3DConfigEditor's preview turns it
   * on. */
  showPerfStats?: boolean;
  /** Mirrors the same 4 fields the built-in perf overlay already shows
   * (fps/drawCalls/triangles/dpr) — when supplied, the caller is
   * rendering its own perf display, so the internal floating overlay is
   * suppressed to avoid showing it twice. Added for the dark-theme
   * configurator restyle's right-rail "Performance Overview" card; the
   * underlying tracking (RenderEngine.ts's samplePerfStats) is unchanged,
   * this only adds a second place the same numbers can be read from. */
  onPerfStats?: (stats: { fps: number; drawCalls: number; triangles: number; dpr: number } | null) => void;
  /** Controlled-mode override for the realistic/conceptual/sketch view
   * switcher — normally 100% internal state, only reachable via the
   * bottom chrome menu that the Admin editor keeps hidden
   * (`showChrome={false}`). Supplying both props lets a caller (the
   * Configurator's new viewport toolbar) drive it externally instead;
   * omit both to keep the existing uncontrolled/internal behavior (every
   * public-viewer usage, unchanged). */
  viewPreset?: ViewPreset;
  onViewPresetChange?: (preset: ViewPreset) => void;
  /** Same controlled-mode pattern for X-Ray — normally derived from which
   * bottom-menu panel is open (`panel === "xray"`), which never happens
   * when `showChrome={false}`. Supplying `xrayEnabled` overrides that
   * derivation entirely; the caller (EditorShell's own toolbar) owns the
   * boolean itself, so there's no matching `onXrayChange` — nothing
   * internal ever needs to set it back. */
  xrayEnabled?: boolean;
}
