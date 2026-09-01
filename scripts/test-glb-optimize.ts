import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import { optimizeGlbForDeliveryDetailed } from "../src/lib/glbOptimize";

const MESHES = 40;
const TEXTURE_SIZE = 512;

async function makeTexture(seed: number): Promise<Uint8Array> {
  const px = Buffer.alloc(TEXTURE_SIZE * TEXTURE_SIZE * 3);
  for (let i = 0; i < px.length; i += 3) {
    const n = (i * 2654435761 + seed * 40503) >>> 0;
    px[i] = n & 0xff;
    px[i + 1] = (n >> 8) & 0xff;
    px[i + 2] = (n >> 16) & 0xff;
  }
  const out = await sharp(px, { raw: { width: TEXTURE_SIZE, height: TEXTURE_SIZE, channels: 3 } })
    .png()
    .toBuffer();
  return new Uint8Array(out);
}

async function buildFixture(): Promise<ArrayBuffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();

  for (let m = 0; m < MESHES; m++) {
    const position = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]))
      .setBuffer(buffer);
    const uv = doc
      .createAccessor()
      .setType("VEC2")
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint16Array([0, 1, 2, 1, 3, 2]))
      .setBuffer(buffer);

    const texture = doc
      .createTexture(`tex_${m}`)
      .setImage(await makeTexture(m))
      .setMimeType("image/png");
    const material = doc.createMaterial(`mat_${m}`).setBaseColorTexture(texture);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", position)
      .setAttribute("TEXCOORD_0", uv)
      .setIndices(indices)
      .setMaterial(material);
    const mesh = doc.createMesh(`mesh_${m}`).addPrimitive(prim);
    scene.addChild(doc.createNode(`node_${m}`).setMesh(mesh));
  }

  const bin = await new NodeIO().writeBinary(doc);
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
}

interface GlbJson {
  extensionsUsed?: string[];
  textures?: { extensions?: { EXT_texture_webp?: { source?: number } } }[];
}

function readGlbJson(glb: Uint8Array): GlbJson {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  let offset = 12;
  while (offset < glb.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (chunkType === 0x4e4f534a) {
      const bytes = glb.subarray(offset + 8, offset + 8 + chunkLength);
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    offset += 8 + chunkLength;
  }
  throw new Error("No JSON chunk found in GLB");
}

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
const failures: string[] = [];
function check(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures.push(label);
}

async function main() {
  console.log(`Building fixture: ${MESHES} meshes, ${MESHES} textures @ ${TEXTURE_SIZE}px PNG...`);
  const fixture = await buildFixture();
  console.log(`Fixture: ${mb(fixture.byteLength)}\n`);

  console.log("1. Geometry-only pass (what the upload route runs today):");
  const geo = await optimizeGlbForDeliveryDetailed(fixture);
  console.log(`   ${mb(geo.report.inputBytes)} -> ${mb(geo.report.outputBytes)}`);
  check(
    "geometry pass leaves textures alone",
    geo.report.texturesCompressed === false && geo.report.texturesSkippedReason === "not requested",
    `texturesCompressed=${geo.report.texturesCompressed}, reason="${geo.report.texturesSkippedReason}"`
  );
  check(
    "geometry pass reports the real texture/mesh counts",
    geo.report.textureCount === MESHES && geo.report.meshCount === MESHES,
    `${geo.report.textureCount} textures / ${geo.report.meshCount} meshes`
  );
  check(
    "geometry pass produces a loadable GLB",
    (await new NodeIO().readBinary(geo.bytes)).getRoot().listMeshes().length > 0,
    "re-parsed OK"
  );

  console.log("\n2. Texture pass, WebP re-encode (opt-in):");
  const tex = await optimizeGlbForDeliveryDetailed(fixture, { textures: true });
  const saved = 1 - tex.report.outputBytes / tex.report.inputBytes;
  console.log(`   ${mb(tex.report.inputBytes)} -> ${mb(tex.report.outputBytes)}  (${(saved * 100).toFixed(1)}% saved)`);
  check(
    "texture pass actually ran (sharp works in this environment)",
    tex.report.texturesCompressed,
    tex.report.texturesCompressed ? "sharp + EXT_texture_webp OK" : `skipped: ${tex.report.texturesSkippedReason}`
  );
  check("texture pass makes a texture-heavy GLB smaller", saved > 0.1, `${(saved * 100).toFixed(1)}% smaller`);
  const reparsed = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(tex.bytes);
  check(
    "texture pass produces a loadable GLB with all textures intact",
    reparsed.getRoot().listTextures().length === MESHES,
    `${reparsed.getRoot().listTextures().length}/${MESHES} textures survived`
  );
  check(
    "textures are really WebP now",
    reparsed.getRoot().listTextures().every((t) => t.getMimeType() === "image/webp"),
    reparsed.getRoot().listTextures()[0]?.getMimeType() ?? "none"
  );

  const json = readGlbJson(tex.bytes);
  const used: string[] = json.extensionsUsed ?? [];
  check(
    "written GLB declares EXT_texture_webp in extensionsUsed",
    used.includes("EXT_texture_webp"),
    used.length ? used.join(", ") : "no extensions declared"
  );
  check(
    "every texture image is wired through the EXT_texture_webp extension",
    Array.isArray(json.textures) &&
      json.textures.length === MESHES &&
      json.textures.every((t) => typeof t.extensions?.EXT_texture_webp?.source === "number"),
    `${(json.textures ?? []).filter((t) => t.extensions?.EXT_texture_webp).length}/${MESHES} textures carry the extension`
  );

  console.log("\n3. Texture pass with a 256px downscale cap:");
  const small = await optimizeGlbForDeliveryDetailed(fixture, { textures: true, textureMaxSize: 256 });
  const savedSmall = 1 - small.report.outputBytes / small.report.inputBytes;
  console.log(`   ${mb(small.report.inputBytes)} -> ${mb(small.report.outputBytes)}  (${(savedSmall * 100).toFixed(1)}% saved)`);
  check("downscale cap saves more than re-encode alone", savedSmall > saved, `${(savedSmall * 100).toFixed(1)}% vs ${(saved * 100).toFixed(1)}%`);

  console.log("\n4. Malformed input still throws (caller's fallback stays reachable):");
  let threw = false;
  try {
    await optimizeGlbForDeliveryDetailed(new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer);
  } catch {
    threw = true;
  }
  check("garbage input throws rather than returning junk", threw, threw ? "threw as expected" : "did not throw");

  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(", ")}` : "\nAll checks passed.");
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
