import type { Project, Project3DConfig, Unit } from "@/lib/types";

/** Shared imperative handle + props contract between the dispatcher
 * (ThreeProjectViewer.tsx) and its two implementations
 * (ProceduralProjectViewer.tsx, MapboxProjectViewer.tsx) — kept in its own
 * module so none of the three files need to import from one another just
 * for a type, which would otherwise create a circular import between the
 * dispatcher and whichever implementation it renders. */
export interface ThreeProjectViewerHandle {
  /** PRD §7.1/§16 — "Reset returns to Admin-saved starting camera." */
  resetView: () => void;
  /** Captures the current WebGL frame as a PNG data URL — null if the
   * renderer isn't ready (e.g. WebGL failed to init). */
  captureScreenshot: () => string | null;
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
}
