/** Shared prop types for the Phase 2 editor shell's panels/rail — avoids
 * every panel file re-deriving `useT()`'s `t` signature independently. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Passed to any Milestone C undo/redo-tracked setter. `commit: true`
 * (discrete controls — `<select>`, a toggle, a button) makes the change
 * its own undo step immediately; omitted/false (continuous controls —
 * sliders) coalesces a burst of calls into one step after a short idle
 * debounce. See useUndoRedo.ts. */
export interface SetOpts {
  commit?: boolean;
}

/** The left rail's building/floor selection (Inventory/Floors mockup
 * pass, `BuildingNavRail.tsx`) — `null` means "no floor selected, show
 * everything." Threaded into the Inventory tab (`UnitsPanel.tsx`) to
 * filter its unit lists; this is also the real seam a future Floors &
 * Sections PRD would extend (e.g. a default cut height derived from the
 * selected floor) without needing to touch this selection model again. */
export interface FloorFilter {
  building: string;
  floor: number;
}

/** The global bottom status bar's device-preview toggle
 * (`EditorStatusBar.tsx`, Inventory/Floors mockup pass) — a real feature:
 * constrains the viewport column's CSS width to simulate each breakpoint,
 * not a stub. */
export type PreviewWidth = "desktop" | "tablet" | "mobile";
