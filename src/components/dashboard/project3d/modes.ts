/** The Phase 2 editor shell's 7 top-level modes (master PRD's "viewport-
 * first 7-mode shell": Model/Materials/Lighting/Camera/Units/Effects/
 * Viewer). Order here is the tab-bar's left-to-right order. */
export const EDITOR_MODES = [
  "model",
  "materials",
  "lighting",
  "camera",
  "units",
  "effects",
  "viewer",
] as const;

export type EditorMode = (typeof EDITOR_MODES)[number];

/** Modes where the persistent scene-tree/inspector rail is relevant —
 * node selection means something on Model (which node moved with the
 * scale/rotation sliders), Materials (per-node material override), and
 * Units (which node a unit link corresponds to). Hidden on
 * Lighting/Camera/Effects/Viewer, which don't operate on a specific node. */
export const MODES_WITH_SCENE_RAIL: ReadonlySet<EditorMode> = new Set(["model", "materials", "units"]);
