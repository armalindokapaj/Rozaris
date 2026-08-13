import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, weld } from "@gltf-transform/functions";

/**
 * Real original/delivery asset split (rewrite Track B, step 5) — the
 * first actual optimization step this pipeline has ever run; previously
 * `sourceAssetUrl === publicAssetUrl` always (the raw upload was served
 * as-is, see the gap analysis this rewrite is built on).
 *
 * Deliberately conservative for this pass: dedup (removes duplicate
 * accessors/materials/textures/meshes — a real, common win on GLBs
 * exported by tools that don't already dedup) + weld (merges duplicate
 * vertices) + prune (drops anything left unused after the above). No
 * Draco/Meshopt re-compression and no texture recompression yet — those
 * need extra native/WASM encoder packages this pass doesn't add, and
 * texture recompression specifically risks a visible quality regression
 * that can't be checked in this environment. Explicitly deferred, not
 * silently skipped — same "flagged, not solved" pattern already used
 * elsewhere in this codebase for SSGI/FXAA.
 *
 * Never throws for a structurally-valid GLB it can't improve further —
 * gltf-transform's own functions are no-ops on a document with nothing to
 * dedup/weld/prune. Callers should still wrap this in try/catch: a
 * malformed/adversarial upload could still throw during parse, and the
 * caller's job is to fall back to using the original file as its own
 * delivery copy, never to block the upload on this optimization failing.
 */
export async function optimizeGlbForDelivery(buffer: ArrayBuffer): Promise<Uint8Array> {
  const io = new NodeIO();
  const document = await io.readBinary(new Uint8Array(buffer));
  await document.transform(dedup(), weld(), prune());
  return await io.writeBinary(document);
}
