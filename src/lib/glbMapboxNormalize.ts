/**
 * Rewrites a GLB into the ONE vertex layout Mapbox's own model loader can
 * read: every accessor tightly packed in its own bufferView, never
 * interleaved.
 *
 * This is not a preference — it is a hard limitation of mapbox-gl (3.27),
 * and it is why an admin-uploaded GLB could load fine in the Three.js
 * viewer and fail with a bare `RangeError: offset is out of bounds` on the
 * map. Mapbox reads an accessor with:
 *
 *   new Ctor(buffer, accessor.byteOffset + bufferView.byteOffset,
 *            accessor.count * (bufferView.byteStride
 *              ? bufferView.byteStride / Ctor.BYTES_PER_ELEMENT
 *              : componentsPerElement))
 *
 * then does `vertexArray.resizeExact(accessor.count)` followed by
 * `vertexArray.float32.set(thatView)`. For an interleaved POSITION
 * (`byteStride: 32` — POSITION + NORMAL + TEXCOORD_0 packed per vertex,
 * which is what Blender, Rhino and most exporters emit by default) the
 * view is `count * 8` floats while the destination holds `count * 3` — so
 * `.set()` throws before a single triangle is drawn. Mapbox walks the
 * stride correctly for NORMAL/TEXCOORD_0/COLOR_0; POSITION and the index
 * accessor are the ones it copies wholesale.
 *
 * De-interleaving is a lossless re-layout: the same accessors, the same
 * values, the same node/material/texture graph — only the byte
 * arrangement changes (and the file gets marginally larger). Nothing else
 * in Rozaris cares: the Three.js paths (`ProjectModelLayer.ts`, the
 * Project Viewer's `RenderEngine`) read either layout equally well.
 *
 * `@gltf-transform/core` ONLY — never `@gltf-transform/functions`, which
 * pulls `ndarray-pixels` → `sharp` and cannot run in a browser (and has a
 * documented history of crashing this app's serverless routes at module
 * load; see the detail-model versions route). Core's single dependency is
 * `property-graph`, and its `NodeIO` reaches for `node:fs` only through a
 * dynamic import behind a `browser: { fs: false }` mapping, so importing
 * this module client-side is safe.
 */

/** A mesh whose vertices outnumber this cannot be drawn correctly by
 * mapbox-gl: it copies the index accessor into a Uint16 triangle array
 * (`indexArray.uint16.set(...)`), so any index at or above 65,536 wraps
 * around and stitches the mesh to the wrong vertices. Reported as a
 * warning rather than a hard failure — de-interleaving still helps, and
 * the caller decides whether an over-budget model is worth publishing. */
const MAPBOX_MAX_VERTICES_PER_PRIMITIVE = 65_536;

export interface GlbNormalizeResult {
  bytes: Uint8Array;
  /** False when the file was already tightly packed and the round-trip
   * changed nothing meaningful — callers can skip re-uploading. */
  changed: boolean;
  /** Human-readable notes worth surfacing to Admin (currently only the
   * vertex-count ceiling above). Empty on a clean file. */
  warnings: string[];
}

export async function normalizeGlbForMapbox(input: Uint8Array): Promise<GlbNormalizeResult> {
  const { WebIO, VertexLayout } = await import("@gltf-transform/core");
  const io = new WebIO().setVertexLayout(VertexLayout.SEPARATE);
  const document = await io.readBinary(input);

  const warnings: string[] = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      const count = position?.getCount() ?? 0;
      if (count > MAPBOX_MAX_VERTICES_PER_PRIMITIVE) {
        warnings.push(
          `Mesh "${mesh.getName() || "(unnamed)"}" has ${count.toLocaleString()} vertices; ` +
            `Mapbox indexes models with 16-bit integers, so anything past ` +
            `${MAPBOX_MAX_VERTICES_PER_PRIMITIVE.toLocaleString()} will render distorted. Split or decimate it.`
        );
      }
    }
  }

  const bytes = await io.writeBinary(document);
  return { bytes, changed: !isTightlyPacked(input), warnings };
}

/**
 * True when no bufferView carries a `byteStride` wider than the accessor
 * elements that reference it — i.e. nothing is interleaved and Mapbox can
 * already read the file as-is. Read straight off the GLB's JSON chunk
 * rather than through gltf-transform, because the point is to describe the
 * INPUT file's real byte layout, which the parsed document no longer
 * remembers.
 */
export function isTightlyPacked(input: Uint8Array): boolean {
  const json = readGlbJsonChunk(input);
  if (!json) return true; // unparseable here — let the real reader decide
  const bufferViews = json.bufferViews ?? [];
  const accessors = json.accessors ?? [];
  for (const accessor of accessors) {
    if (accessor.bufferView == null) continue;
    const view = bufferViews[accessor.bufferView];
    if (!view?.byteStride) continue;
    const tight = COMPONENTS_PER_TYPE[accessor.type] * BYTES_PER_COMPONENT[accessor.componentType];
    if (view.byteStride !== tight) return false;
  }
  return true;
}

interface GlbJson {
  bufferViews?: { byteStride?: number }[];
  accessors?: { bufferView?: number; type: string; componentType: number }[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"

const COMPONENTS_PER_TYPE: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const BYTES_PER_COMPONENT: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

/** Minimal GLB container walk — the same hand-rolled approach (and the
 * same reasoning) as `glbValidate.ts`: 12-byte header, then length-
 * prefixed chunks, of which only the first (JSON) is needed here. */
function readGlbJsonChunk(input: Uint8Array): GlbJson | null {
  try {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    if (view.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) return null;
    const chunkLength = view.getUint32(12, true);
    if (view.getUint32(16, true) !== CHUNK_TYPE_JSON) return null;
    const text = new TextDecoder().decode(input.subarray(20, 20 + chunkLength));
    return JSON.parse(text) as GlbJson;
  } catch {
    return null;
  }
}
