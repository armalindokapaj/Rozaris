const MAPBOX_MAX_VERTICES_PER_PRIMITIVE = 65_536;

export interface GlbNormalizeResult {
  bytes: Uint8Array;
  changed: boolean;
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

export function isTightlyPacked(input: Uint8Array): boolean {
  const json = readGlbJsonChunk(input);
  if (!json) return true;
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

const GLB_MAGIC = 0x46546c67;
const CHUNK_TYPE_JSON = 0x4e4f534a;

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
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

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
