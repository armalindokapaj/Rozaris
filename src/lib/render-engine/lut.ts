import * as THREE from "three/webgpu";
import { LUTCubeLoader } from "three/examples/jsm/loaders/LUTCubeLoader.js";
import { LUT3dlLoader } from "three/examples/jsm/loaders/LUT3dlLoader.js";
import { LUTImageLoader } from "three/examples/jsm/loaders/LUTImageLoader.js";
import { LUT_PRESETS } from "@/lib/viewerPresets";

/**
 * Rendering → Color's 3D LUT (`webgl_postprocessing_3dlut.html` parity) —
 * loads one of the 9 real vendored LUT files (see LUT_PRESETS/public/luts)
 * via the loader its own `format` picks, exactly the reference demo's own
 * extension-based dispatch. Cached per preset id (module-level, survives
 * across mount/dispose cycles like every other loaded static asset in this
 * app) since these are small, fixed, never change per-project — only
 * *which* preset a project points at does.
 */
export interface LutResource {
  texture3D: THREE.Data3DTexture;
  size: number;
}

const cache = new Map<string, LutResource>();
const inFlight = new Map<string, Promise<LutResource | null>>();

function loadWithLoader(loader: LUTCubeLoader | LUT3dlLoader | LUTImageLoader, url: string): Promise<LutResource | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (result: LutResource) => resolve({ texture3D: result.texture3D, size: result.size }),
      undefined,
      () => resolve(null)
    );
  });
}

/** Returns the cached resource synchronously if already loaded; otherwise
 * kicks off (or reuses) an in-flight load and returns null for THIS call
 * — the caller (RenderEngine's applyRenderingConfig) re-applies once the
 * returned promise resolves, matching the ArtificialLightSystem/IES
 * loader's own "fire, cache, re-apply on resolve" pattern. */
export function getLutResource(presetId: string): LutResource | null {
  const cached = cache.get(presetId);
  if (cached) return cached;
  return null;
}

export function ensureLutLoading(presetId: string, onReady: () => void) {
  if (cache.has(presetId) || inFlight.has(presetId)) return;
  const preset = LUT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const url = `/luts/${preset.file}`;
  const loader = preset.format === "cube" ? new LUTCubeLoader() : preset.format === "3dl" ? new LUT3dlLoader() : new LUTImageLoader();
  const promise = loadWithLoader(loader, url).then((resource) => {
    inFlight.delete(presetId);
    if (resource) {
      cache.set(presetId, resource);
      onReady();
    }
    return resource;
  });
  inFlight.set(presetId, promise);
}
