import type { Project, Project3DConfig, Unit } from "@/lib/types";

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
}
