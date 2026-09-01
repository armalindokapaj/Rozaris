import type { ProjectDetailModelSlotEntry } from "@/hooks/useProjectDetailModel";
import type { ConstructionTimelineDraft, Project, Project3DConfig, Unit } from "@/lib/types";

export interface ProjectViewerRuntimeBootstrap {
  project: Project;
  construction: ConstructionTimelineDraft;
  detailModels: ProjectDetailModelSlotEntry[];
  viewerConfig: Project3DConfig;
  units: Unit[];
}

export type ViewerChannel = "marketplace" | "white_label";
