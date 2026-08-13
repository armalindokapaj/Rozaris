/** The editor shell's top-level modes, shown as tabs in the full-width top
 * tab bar. "Sections" (first-class Configurator module, 2026-08-13) sits
 * before "Inventory" — it creates and controls the cut; Inventory only
 * consumes the floor identity a section can optionally carry
 * (`Section.floorId`). Order matches the reference mockup: Model /
 * Materials / Lighting / Camera / Sections / Inventory / Effects /
 * Viewer. */
export const EDITOR_MODES = [
  "model",
  "materials",
  "lighting",
  "camera",
  "sections",
  "inventory",
  "effects",
  "viewer",
] as const;

export type EditorMode = (typeof EDITOR_MODES)[number];
