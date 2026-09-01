import { defaultProject3DConfig } from "@/lib/store";
import type { Project3DConfig } from "@/lib/types";

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
