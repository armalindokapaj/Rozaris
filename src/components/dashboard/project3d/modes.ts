/** The editor shell's top-level modes, shown as tabs in the right panel.
 * "Units" moved out of this tab strip (3-column layout pass, 2026-08-13)
 * into its own persistent left panel alongside the Scene Explorer — unit
 * linking and node structure are both "where things live in the scene,"
 * distinct from the per-tab option panels on the right. See
 * EditorShell.tsx's layout comment for the full 25/50/25 split. */
export const EDITOR_MODES = ["model", "materials", "lighting", "camera", "effects", "viewer"] as const;

export type EditorMode = (typeof EDITOR_MODES)[number];
