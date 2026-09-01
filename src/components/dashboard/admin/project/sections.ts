export const PROJECT_SECTION_IDS = [
  "overview",
  "general",
  "location",
  "mapControl",
  "media",
  "features",
  "inventory",
  "sheetSync",
  "listings",
  "timeline",
  "team",
  "threeD",
  "publishing",
  "activity",
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTION_IDS)[number];
