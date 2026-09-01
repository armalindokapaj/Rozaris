"use client";

import { useMemo } from "react";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { useProject3DConfig } from "@/hooks/useProject3DConfig";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { ProjectViewerRuntime } from "@/components/viewer-runtime/ProjectViewerRuntime";
import type { Project } from "@/lib/types";

export function MarketplaceViewer({ project }: { project: Project }) {
  const construction = useProjectConstruction(project);
  const detailModels = useProjectDetailModel(project.id);
  const viewerConfig = useProject3DConfig(project.id);
  const { units: liveUnits } = useProjectUnits(project.id);
  const units = useMemo(() => liveUnits ?? [], [liveUnits]);

  const bootstrap = useMemo(
    () => ({ project, construction, detailModels, viewerConfig, units }),
    [project, construction, detailModels, viewerConfig, units]
  );

  return <ProjectViewerRuntime bootstrap={bootstrap} channel="marketplace" />;
}
