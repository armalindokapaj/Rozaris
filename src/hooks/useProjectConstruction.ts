import { useAppStore } from "@/lib/store";
import type { ConstructionTimelineDraft, Project } from "@/lib/types";

export function useProjectConstruction(project: Project): ConstructionTimelineDraft {
  const override = useAppStore((s) => s.projectConstructionOverrides[project.id]);
  return override ?? { progressPercent: project.progressPercent, stages: project.constructionStages };
}
