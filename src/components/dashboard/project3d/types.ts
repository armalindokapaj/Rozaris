import type { NodeOverride, SceneManifestNode } from "@/lib/types";

/** Moved from Project3DConfigEditor.tsx (was defined at the top of that
 * single file) — shared by the editor shell, ModelPanel, and
 * Project3DConfigEditor.tsx itself, all of which need the same
 * `GET .../versions` response shape. */
export interface UnitLinkRow {
  meshName: string;
  unitId: string;
  mappingStatus: string;
}

export interface DetailVersionRow {
  id: string;
  version: number;
  fileName: string;
  fileSize: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  validationStatus: "ready" | "warning" | "blocked";
  validationIssues: string[] | null;
  publicationStatus: "draft" | "published" | "archived";
  publicAssetUrl: string;
  createdAt: string;
  unitLinks: UnitLinkRow[];
  sceneManifest: SceneManifestNode[] | null;
  nodeOverrides: NodeOverride[] | null;
  // GET /versions returns the full DetailModelVersion row (no `select`
  // filter) — these four are already present in that JSON, just not
  // declared here before now. Sourced by glbValidate.ts at upload time,
  // same as ProjectDetailModel's own fields of the same name.
  triangleCount: number | null;
  meshCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
}
