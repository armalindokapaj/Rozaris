/** Section ids for the Project Manager's left rail. Kept in its own module
 * so `ProjectOverviewSection` can deep-link to a sibling section without
 * importing the page (and creating a cycle). Mirrors the rail's order. */
export const PROJECT_SECTION_IDS = [
  "overview",
  "general",
  "location",
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
