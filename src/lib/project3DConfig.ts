import { defaultProject3DConfig } from "@/lib/store";
import type { Project3DConfig } from "@/lib/types";

/**
 * Multi-Channel Publishing PRD Phase 5 — pulled out of
 * `useProject3DConfig.ts` so both that hook (marketplace, reads the live
 * `/api/project-3d-config/[projectId]` row) and the white-label manifest
 * adapter (reads a compiled `ViewerRelease.manifest.rendering` snapshot —
 * same shape, different source) apply the exact same nullable-Json-column
 * coalescing instead of two copies drifting apart. Any row/snapshot saved
 * before the Render/visual-quality, Publish/runtime-hardening, Sun & Sky,
 * or Lighting passes has `cameraPresets`/`viewerUI`/`sections`/
 * `solarAnchors`/`artificialLights` as real `null` even though
 * `Project3DConfig` declares them non-null — every real project's saved
 * config predates at least one of those, so this isn't a hypothetical
 * edge case.
 */
export function normalizeProject3DConfigRow(row: Partial<Project3DConfig> | null): Project3DConfig {
  if (!row) return defaultProject3DConfig;
  return {
    ...defaultProject3DConfig,
    ...row,
    cameraPresets: row.cameraPresets ?? [],
    viewerUI: row.viewerUI ?? defaultProject3DConfig.viewerUI,
    sections: row.sections ?? [],
    solarAnchors: row.solarAnchors ?? [],
    artificialLights: row.artificialLights ?? [],
  };
}
