import { useAppStore, defaultProject3DConfig } from "@/lib/store";
import type { Project3DConfig } from "@/lib/types";

/** A project's live "3D Experience" config — the Admin-authored override if
 * one has been saved, otherwise the platform default (PRD_3D_Project_Viewer
 * §11/§15/§16). Mirrors useProjectConstruction's override pattern. */
export function useProject3DConfig(projectId: string): Project3DConfig {
  const override = useAppStore((s) => s.project3DConfigs[projectId]);
  return override ?? defaultProject3DConfig;
}
