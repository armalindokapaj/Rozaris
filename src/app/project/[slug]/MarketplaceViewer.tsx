"use client";

import { useMemo } from "react";
import { useProjectConstruction } from "@/hooks/useProjectConstruction";
import { useProjectDetailModel } from "@/hooks/useProjectDetailModel";
import { useProject3DConfig } from "@/hooks/useProject3DConfig";
import { useProjectUnits } from "@/hooks/useProjectUnits";
import { ProjectViewerRuntime } from "@/components/viewer-runtime/ProjectViewerRuntime";
import type { Project } from "@/lib/types";

/**
 * Multi-Channel Publishing PRD Phase 4 — replaces `ArchVizClient` at the
 * two call sites that used to render it (`/project/[slug]/page.tsx`,
 * `CustomProjectPreview.tsx`). This is the "marketplace" half of the
 * PRD's own diagram (`MarketplaceViewer` / `WhiteLabelViewer` → shared
 * `ProjectViewerRuntime`): it owns exactly the 4 live-data hooks
 * `ArchVizClient` used to call directly, assembles them into a
 * `ProjectViewerRuntimeBootstrap`, and hands that to the shared runtime.
 * No rendering logic lives here — see `ProjectViewerRuntime`'s own doc
 * comment for that (unchanged behavior, just relocated).
 */
export function MarketplaceViewer({ project }: { project: Project }) {
  const construction = useProjectConstruction(project);
  const detailModels = useProjectDetailModel(project.id);
  const viewerConfig = useProject3DConfig(project.id);
  // Units Search Mode PRD, Phase 3 (2026-08-16) — real Postgres units
  // (same source the admin Configurator's own Units panel reads),
  // replacing Phase 2's placeholder inventory (since removed). `?? []`
  // while the initial GET is in flight or this project genuinely has
  // none yet — an honestly empty list, not a fabricated one.
  const { units: liveUnits } = useProjectUnits(project.id);
  const units = useMemo(() => liveUnits ?? [], [liveUnits]);

  const bootstrap = useMemo(
    () => ({ project, construction, detailModels, viewerConfig, units }),
    [project, construction, detailModels, viewerConfig, units]
  );

  return <ProjectViewerRuntime bootstrap={bootstrap} channel="marketplace" />;
}
