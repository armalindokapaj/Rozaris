import { useAppStore } from "@/lib/store";
import type { ConstructionTimelineDraft, Project } from "@/lib/types";

/** A project's live construction progress — the admin-approved override if
 * one has been applied, otherwise the project's own seeded data. */
export function useProjectConstruction(project: Project): ConstructionTimelineDraft {
  const override = useAppStore((s) => s.projectConstructionOverrides[project.id]);
  return override ?? { progressPercent: project.progressPercent, stages: project.constructionStages };
}
