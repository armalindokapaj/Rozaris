/**
 * Server-side GLB structural validation (PRD_Admin_Mapbox_GLB §6/§9,
 * PRD_Admin_3D_Project_Experience §9) — runs in a route handler after the
 * client has already uploaded the file directly to Vercel Blob (our server
 * never sees the raw upload bytes in that flow, only the resulting URL), so
 * the version-creation route `fetch()`s the blob back and validates it here
 * before persisting a draft version.
 *
 * Deliberately dependency-free: parses the GLB binary container by hand
 * (12-byte header + length-prefixed JSON/BIN chunks per the glTF 2.0 spec)
 * rather than pulling in three.js's GLTFLoader (browser/DOM-oriented, used
 * client-side today in src/lib/glbUnitNodes.ts and the map/viewer layers)
 * or a heavier gltf-validator/gltf-transform dependency. Good enough for
 * MVP structural checks — not a full glTF schema validator.
 */

const UNIT_NODE_PATTERN = /^Unit_/i;

export type ValidationStatus = "ready" | "warning" | "blocked";

export interface GlbValidationResult {
  status: ValidationStatus;
  issues: string[];
  triangleCount: number | null;
  meshCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
  /** Node/mesh names matching the existing `Unit_<number>` convention
   * (src/lib/glbUnitNodes.ts) — used for unit-mesh carry-forward matching
   * on the detailed 3D Experience pipeline; unused (but harmless) for the
   * lightweight map-model pipeline. */
  unitNodeNames: string[];
}

interface GltfAccessor {
  count?: number;
}
interface GltfPrimitive {
  indices?: number;
  mode?: number; // glTF default primitive mode is 4 (TRIANGLES) when omitted
}
interface GltfMesh {
  primitives?: GltfPrimitive[];
}
interface GltfNode {
  name?: string;
}
interface GltfJson {
  meshes?: GltfMesh[];
  materials?: unknown[];
  images?: unknown[];
  nodes?: GltfNode[];
  accessors?: GltfAccessor[];
}

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"

/** Thresholds are intentionally generous MVP defaults, named/exported so
 * they're easy to retune later rather than magic numbers buried in logic. */
export const VALIDATION_THRESHOLDS = {
  mapModel: { warnTriangles: 150_000, blockTriangles: 500_000 },
  detailModel: { warnTriangles: 800_000, blockTriangles: 2_000_000 },
} as const;

export type ModelKind = keyof typeof VALIDATION_THRESHOLDS;

function parseGlbJsonChunk(buffer: ArrayBuffer): GltfJson {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20) throw new Error("File too small to be a valid GLB.");
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) throw new Error("Not a GLB file (bad magic bytes).");
  const totalLength = view.getUint32(8, true);
  if (totalLength > buffer.byteLength) throw new Error("GLB header length exceeds file size.");

  // First chunk starts right after the 12-byte header; per spec, chunk 0 is
  // always the JSON chunk.
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== CHUNK_TYPE_JSON) throw new Error("First GLB chunk isn't JSON.");
  const jsonBytes = new Uint8Array(buffer, 20, chunkLength);
  const jsonText = new TextDecoder("utf-8").decode(jsonBytes);
  return JSON.parse(jsonText) as GltfJson;
}

export async function validateGlb(
  buffer: ArrayBuffer,
  kind: ModelKind
): Promise<GlbValidationResult> {
  const issues: string[] = [];
  let json: GltfJson;
  try {
    json = parseGlbJsonChunk(buffer);
  } catch (e) {
    return {
      status: "blocked",
      issues: [(e as Error).message],
      triangleCount: null,
      meshCount: null,
      materialCount: null,
      textureCount: null,
      unitNodeNames: [],
    };
  }

  const meshCount = json.meshes?.length ?? 0;
  const materialCount = json.materials?.length ?? 0;
  const textureCount = json.images?.length ?? 0;

  let triangleCount = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode != null && prim.mode !== 4) continue; // non-triangle primitive, skip
      const accessor = prim.indices != null ? json.accessors?.[prim.indices] : undefined;
      if (accessor?.count != null) triangleCount += Math.floor(accessor.count / 3);
    }
  }

  const unitNodeNames = Array.from(
    new Set((json.nodes ?? []).map((n) => n.name).filter((n): n is string => !!n && UNIT_NODE_PATTERN.test(n)))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  if (meshCount === 0) issues.push("No meshes found in the GLB.");

  const { warnTriangles, blockTriangles } = VALIDATION_THRESHOLDS[kind];
  if (triangleCount > blockTriangles) {
    issues.push(`Triangle count ${triangleCount.toLocaleString()} exceeds the ${blockTriangles.toLocaleString()} block threshold for this pipeline.`);
  } else if (triangleCount > warnTriangles) {
    issues.push(`Triangle count ${triangleCount.toLocaleString()} exceeds the ${warnTriangles.toLocaleString()} recommended limit — review before publishing.`);
  }

  let status: ValidationStatus = "ready";
  if (meshCount === 0 || triangleCount > blockTriangles) status = "blocked";
  else if (issues.length > 0) status = "warning";

  return { status, issues, triangleCount, meshCount, materialCount, textureCount, unitNodeNames };
}

/** Fetches an already-uploaded Blob URL and validates it — the entry point
 * route handlers actually call. */
export async function fetchAndValidateGlb(url: string, kind: ModelKind): Promise<GlbValidationResult> {
  const res = await fetch(url);
  if (!res.ok) {
    return {
      status: "blocked",
      issues: [`Could not fetch the uploaded asset (HTTP ${res.status}).`],
      triangleCount: null,
      meshCount: null,
      materialCount: null,
      textureCount: null,
      unitNodeNames: [],
    };
  }
  const buffer = await res.arrayBuffer();
  return validateGlb(buffer, kind);
}
