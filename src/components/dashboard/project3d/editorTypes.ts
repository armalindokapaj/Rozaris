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
