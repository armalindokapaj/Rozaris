/** PRD v2.0 §3 — Editor Workspace main tabs. Order matters: it's also the
 * §48 authoring workflow order (Scene → ... → Publish). No Animation tab,
 * no Sequencer, no timeline — explicitly ruled out by the PRD. */
export const EDITOR_TABS = [
  "scene",
  "units",
  "materials",
  "environment",
  "lighting",
  "rendering",
  "presets",
  "sections",
  "camera",
  "shots",
  "interaction",
  "performance",
  "publish",
] as const;

export type EditorTabId = (typeof EDITOR_TABS)[number];

export const EDITOR_TAB_LABELS: Record<EditorTabId, string> = {
  scene: "Scene",
  units: "Units",
  materials: "Materials",
  environment: "Environment",
  lighting: "Lighting",
  rendering: "Rendering",
  presets: "Presets",
  sections: "Sections",
  camera: "Camera",
  shots: "Shots",
  interaction: "Interaction",
  performance: "Performance",
  publish: "Publish",
};

/** Only Scene has real Inspector content in Phase 0 (the preserved upload
 * section + a Phase-1 placeholder for Model/Hierarchy/Layers/Unit Mapping).
 * Every other tab is a real, honest "not built yet" placeholder — nothing
 * here pretends to be functional ahead of its own phase. Units Blocks &
 * POI Layer PRD §23 — real as of that PRD's own implementation pass, not a
 * placeholder despite the high phase number (it's dated by insertion
 * order into this map, not by risk/build order). */
export const EDITOR_TAB_PHASE: Record<EditorTabId, number> = {
  scene: 0,
  units: 10,
  materials: 1,
  environment: 2,
  lighting: 3,
  rendering: 4,
  presets: 11,
  sections: 5,
  camera: 6,
  shots: 6,
  interaction: 7,
  performance: 8,
  publish: 9,
};
