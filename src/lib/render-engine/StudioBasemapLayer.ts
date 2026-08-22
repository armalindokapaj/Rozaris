import mapboxgl from "mapbox-gl";
import * as THREE from "three/webgpu";

export interface StudioBasemapLayerCallbacks {
  onRendererReady: (renderer: THREE.WebGPURenderer) => void;
  onRendererFailed: (error: unknown) => void;
  /** Called on every Mapbox repaint once the renderer is ready — this
   * layer owns no scene/camera/model state of its own, it's purely the
   * shared-context plumbing, so the actual per-frame update+draw work
   * (RenderEngine's own `renderFrame()`) lives entirely on the caller
   * side. */
  onFrame: () => void;
}

/**
 * Mapbox custom layer for "Mapbox merged into the Studio Scene" (see the
 * approved plan, Phase 2) — exists ONLY to hand `RenderEngine` a real
 * `THREE.WebGPURenderer` bound to Mapbox's own canvas+WebGL2 context
 * (`forceWebGL: true`, validated headed by the plan's Phase 0 spike) and a
 * per-frame trigger. Unlike `ProjectModelLayer.ts` (the separate/untouched
 * Map tab's own custom layer, which owns a full scene/camera/model of its
 * own), this class owns none of that — `RenderEngine` remains the single
 * owner of scene/camera/`OrbitControls`, which stays the sole navigation
 * input surface (see the plan's design decision: Mapbox's own camera is
 * only ever driven programmatically to mirror it, never interactive here).
 *
 * `WebGPURenderer.init()` is async (unlike classic `THREE.WebGLRenderer`,
 * which `ProjectModelLayer.onAdd()` can construct-and-use synchronously in
 * one callback) — `onAdd` kicks it off and reports back via callback once
 * ready; `render()` is a no-op until then, exactly the gap the Phase 0
 * spike already exercised cleanly.
 */
export class StudioBasemapLayer implements mapboxgl.CustomLayerInterface {
  id = "studio-basemap-layer";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private callbacks: StudioBasemapLayerCallbacks;
  private renderer: THREE.WebGPURenderer | null = null;

  constructor(callbacks: StudioBasemapLayerCallbacks) {
    this.callbacks = callbacks;
  }

  onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
    // `antialias: false` — real hardware MSAA can only be requested at
    // WebGL CONTEXT-CREATION time (`canvas.getContext('webgl2', {antialias
    // : true})`); Mapbox already created this context itself, before we
    // ever see it, almost certainly without requesting multisampling
    // (Mapbox implements its own antialiasing). Passing `antialias: true`
    // here doesn't retroactively add MSAA support to an existing context
    // — Three.js instead tries to set up an internal multisampled render
    // path that assumes the canvas/context CAN do this, silently failing
    // to reach the (non-multisampled) default framebuffer Mapbox actually
    // owns. Studio's own TSL-based TRAA (Rendering → Anti-Aliasing) is the
    // real antialiasing mechanism in this mode regardless — it's a
    // node-graph technique, independent of hardware MSAA support.
    const renderer = new THREE.WebGPURenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: false,
      forceWebGL: true,
    });
    renderer
      .init()
      .then(() => {
        this.renderer = renderer;
        this.callbacks.onRendererReady(renderer);
      })
      .catch((err: unknown) => this.callbacks.onRendererFailed(err));
  }

  onRemove() {
    this.renderer = null;
  }

  render() {
    if (!this.renderer) return; // still awaiting init() — see onAdd above
    this.callbacks.onFrame();
  }
}
