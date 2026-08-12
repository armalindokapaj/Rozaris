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

import type { SceneManifestNode } from "@/lib/types";

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
  /** Every node in the GLB (not just Unit_*) — Editor UX & Scene Structure
   * pass. Empty for the map-model pipeline's own validate() calls; only
   * meaningful/persisted for "detailModel" kind. */
  sceneManifest: SceneManifestNode[];
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
  mesh?: number;
  children?: number[];
}
interface GltfJson {
  meshes?: GltfMesh[];
  materials?: unknown[];
  images?: unknown[];
  nodes?: GltfNode[];
  accessors?: GltfAccessor[];
}

/** Lowercase, alphanumeric-and-underscore-only slug for use inside an
 * `rzNodeId` — deliberately its own small function rather than reusing
 * `glbUnitNodes.ts`'s `normalizeUnitMatchKey` (which strips a leading
 * `Unit_`/`UNIT_` prefix, exactly the info worth keeping visible in a
 * general node-manifest id) or importing anything from that file at all
 * (it pulls in three.js's browser-oriented GLTFLoader — the whole reason
 * this module hand-parses the GLB binary itself, see the file doc comment
 * above; importing it here would quietly reintroduce that dependency into
 * a server-only code path). */
function slugifyNodeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "node";
}

/** Walks the glTF node graph (nodes reference children by index, per the
 * glTF 2.0 spec — no parent pointers in the source data) to assign each
 * node a stable-within-this-file id, its parent's id, and a depth. Roots
 * are nodes no other node lists as a child. */
export function buildSceneManifest(json: GltfJson): SceneManifestNode[] {
  const nodes = json.nodes ?? [];
  const parentOf = new Map<number, number>();
  nodes.forEach((node, i) => {
    (node.children ?? []).forEach((childIndex) => parentOf.set(childIndex, i));
  });

  const ids = nodes.map((node, i) => `rz_${i}_${slugifyNodeName(node.name || `node${i}`)}`);

  function depthOf(index: number, guard = 0): number {
    // `guard` caps recursion on a malformed/cyclic children graph — real
    // glTF files are trees, but this is untrusted uploaded input.
    const parent = parentOf.get(index);
    if (parent == null || guard > nodes.length) return 0;
    return 1 + depthOf(parent, guard + 1);
  }

  return nodes.map((node, i) => {
    const parent = parentOf.get(i);
    const name = node.name || `Node ${i}`;
    return {
      rzNodeId: ids[i],
      name,
      meshIndex: node.mesh ?? null,
      parentRzNodeId: parent != null ? ids[parent] : null,
      depth: depthOf(i),
      isMesh: node.mesh != null,
      autoClassification: UNIT_NODE_PATTERN.test(name) ? "unit_block" : "architecture",
    };
  });
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
      sceneManifest: [],
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

  // Worded to name the actual consequence, not just the raw number — this
  // is the one signal Admin gets, before publishing, that a heavy file will
  // feel laggy once it's actually rendered continuously during map/viewer
  // interaction (drag, rotate, zoom), rather than finding out after the
  // fact on the live page.
  const { warnTriangles, blockTriangles } = VALIDATION_THRESHOLDS[kind];
  const consequence =
    kind === "mapModel"
      ? "may render slowly and feel laggy while dragging or rotating the map"
      : "may render slowly and feel laggy while orbiting the 3D viewer";
  if (triangleCount > blockTriangles) {
    issues.push(`Triangle count ${triangleCount.toLocaleString()} exceeds the ${blockTriangles.toLocaleString()} block threshold for this pipeline — too heavy to publish, ${consequence}.`);
  } else if (triangleCount > warnTriangles) {
    issues.push(`Triangle count ${triangleCount.toLocaleString()} exceeds the ${warnTriangles.toLocaleString()} recommended limit — ${consequence}. Consider simplifying the model before publishing.`);
  }

  let status: ValidationStatus = "ready";
  if (meshCount === 0 || triangleCount > blockTriangles) status = "blocked";
  else if (issues.length > 0) status = "warning";

  // Only the detail-model pipeline has any use for a full node manifest
  // (Scene Explorer, per-node overrides) — skip the walk for map-model
  // uploads rather than compute and immediately discard it.
  const sceneManifest = kind === "detailModel" ? buildSceneManifest(json) : [];

  return { status, issues, triangleCount, meshCount, materialCount, textureCount, unitNodeNames, sceneManifest };
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
      sceneManifest: [],
    };
  }
  const buffer = await res.arrayBuffer();
  return validateGlb(buffer, kind);
}
