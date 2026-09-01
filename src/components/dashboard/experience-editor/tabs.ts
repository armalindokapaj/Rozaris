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
  "map",
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
  map: "Map",
  publish: "Publish",
};

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
  map: 12,
};
