"use client";

import { useEffect, useState } from "react";
import type { DetailModelSlotRole, ProjectDetailModel } from "@/lib/types";

export interface ProjectDetailModelSlotEntry {
  slotId: string;
  slotName: string;
  slotRole: DetailModelSlotRole;
  transformParentSlotId: string | null;
  model: ProjectDetailModel;
}

export function useProjectDetailModel(projectId: string): ProjectDetailModelSlotEntry[] {
  const [models, setModels] = useState<ProjectDetailModelSlotEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail-models/${projectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectDetailModelSlotEntry[]) => {
        if (cancelled) return;
        setModels(
          (rows ?? []).map((row) => ({
            ...row,
            model: {
              ...row.model,
              sceneManifest: row.model.sceneManifest ?? [],
              nodeOverrides: row.model.nodeOverrides ?? [],
            },
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return models;
}
