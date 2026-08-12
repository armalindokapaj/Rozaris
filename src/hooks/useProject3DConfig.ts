"use client";

import { useEffect, useState } from "react";
import { defaultProject3DConfig } from "@/lib/store";
import type { Project3DConfig } from "@/lib/types";

/**
 * A project's live "3D Experience" config — real, shared Postgres row
 * (`/api/project-3d-config/[projectId]`, "3D Experience Phase 1") every
 * visitor's browser reads, not Zustand/localStorage. Falls back to the
 * platform default while loading or if Admin never saved one for this
 * project — same `null`-row-means-"use the default" pattern as
 * useProjectDetailModel.ts's sibling hooks, except this one always returns
 * a full `Project3DConfig` (never `null`) since every caller needs a
 * complete config to hand the viewer immediately, not a loading state.
 */
export function useProject3DConfig(projectId: string): Project3DConfig {
  const [config, setConfig] = useState<Project3DConfig>(defaultProject3DConfig);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project-3d-config/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: Project3DConfig | null) => {
        if (cancelled) return;
        // Any row saved before the Render/visual-quality or Publish/
        // runtime-hardening passes has `cameraPresets`/`viewerUI` as a
        // real `null` in Postgres (both nullable Json columns) even
        // though `Project3DConfig`'s TS type declares them non-null —
        // every real project's saved config predates today, so this
        // isn't a hypothetical edge case, it's the common case.
        setConfig(
          row
            ? { ...row, cameraPresets: row.cameraPresets ?? [], viewerUI: row.viewerUI ?? defaultProject3DConfig.viewerUI }
            : defaultProject3DConfig
        );
      })
      .catch(() => {
        if (!cancelled) setConfig(defaultProject3DConfig);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return config;
}
