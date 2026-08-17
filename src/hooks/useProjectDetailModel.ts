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

/**
 * A project's published detail GLBs — real, shared Postgres rows
 * (`/api/detail-models/[projectId]`) every visitor's browser reads, not
 * Zustand (see ProjectDetailModel's doc comment in src/lib/types.ts, and
 * the sibling useProjectMapModels() in MapView.tsx for the same pattern
 * on the search page). Multiple Detail-Model Slots pass: a project can
 * have several independently-published slots ("Building",
 * "Surroundings", ...) rendering simultaneously, so this returns an
 * array (one entry per slot that currently has a published version) —
 * empty means "nothing published yet" (or still loading), same
 * "harmlessly renders the procedural fallback" behavior the old
 * single-model `null` case had.
 */
export function useProjectDetailModel(projectId: string): ProjectDetailModelSlotEntry[] {
  const [models, setModels] = useState<ProjectDetailModelSlotEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail-models/${projectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectDetailModelSlotEntry[]) => {
        if (cancelled) return;
        // sceneManifest/nodeOverrides are nullable Json columns — this
        // route's own GET handler already coalesces both to `[]` before
        // responding, so this is currently redundant, but that's an
        // implicit contract with one specific route rather than
        // something this hook enforces itself. Audit finding (Publish/
        // runtime hardening pass, carried into this pass): defend here
        // too rather than rely on the route never changing.
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
