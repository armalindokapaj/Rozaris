"use client";

import { useEffect, useState } from "react";
import type { ProjectDetailModel } from "@/lib/types";

/**
 * Fetches a project's detailed GLB placement + unit links from Postgres
 * (/api/detail-models/[projectId]) — a real, shared row every visitor's
 * browser reads, not Zustand (see ProjectDetailModel's doc comment in
 * src/lib/types.ts, and the sibling useProjectMapModels() in MapView.tsx
 * for the same pattern on the search page). `null` means "no row yet" or
 * "still loading" — ThreeProjectViewer.tsx only switches to the Mapbox
 * path once it also sees `enabled: true`, so a still-loading state
 * harmlessly renders the procedural fallback for a moment rather than
 * flashing the wrong viewer.
 */
export function useProjectDetailModel(projectId: string): ProjectDetailModel | null {
  const [model, setModel] = useState<ProjectDetailModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail-models/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: ProjectDetailModel | null) => {
        if (cancelled) return;
        // `sceneManifest`/`nodeOverrides` are nullable Json columns —
        // this route's own GET handler already coalesces both to `[]`
        // before responding, so this is currently redundant, but that's
        // an implicit contract with one specific route rather than
        // something this hook enforces itself. Audit finding (Publish/
        // runtime hardening pass): defend here too rather than rely on
        // the route never changing.
        setModel(row ? { ...row, sceneManifest: row.sceneManifest ?? [], nodeOverrides: row.nodeOverrides ?? [] } : null);
      })
      .catch(() => {
        if (!cancelled) setModel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return model;
}
