import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";

const UNIT_NODE_PATTERN = /^Unit_/i;

/**
 * Loads a detailed GLB just far enough to read its scene-graph node names —
 * used by Project3DConfigEditor right after an upload (and whenever an
 * existing detail model is opened) to detect the `Unit_<number>` boxes the
 * 3D artist baked in, so Admin can link each one to a real Unit. This is a
 * throwaway loader/scene, not the one that ends up rendered — DetailModelLayer
 * does its own load for the live viewer.
 */
export async function extractUnitNodeNames(glbUrl: string): Promise<string[]> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  try {
    const gltf = await loader.loadAsync(glbUrl);
    const names = new Set<string>();
    gltf.scene.traverse((child) => {
      if (child.name && UNIT_NODE_PATTERN.test(child.name)) {
        names.add(child.name);
      }
    });
    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
  } finally {
    dracoLoader.dispose();
  }
}
