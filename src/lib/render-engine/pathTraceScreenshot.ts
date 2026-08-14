import * as THREE from "three/webgpu";
// `three/webgpu`'s own type declarations don't expose `WebGLRenderer`
// (only `WebGPURenderer`), even though the real runtime bundle re-exports
// it fine — imported from plain `'three'` instead, which also happens to
// be the exact type `three-gpu-pathtracer`'s own `WebGLPathTracer`
// constructor expects.
import { WebGLRenderer } from "three";

/**
 * "Render this" — the public Project Viewer's one-shot photorealistic
 * screenshot (`webgl_renderer_pathtracer.html` parity), built on
 * `three-gpu-pathtracer` (not part of three.js core — a separate real npm
 * dependency, `gkjohnson/three-gpu-pathtracer`). Isolated into its own
 * module and dynamically imported from RenderEngine.ts (see its
 * `renderPathTraceScreenshot` method) so this fairly large dependency
 * never loads for a visitor who never clicks the button.
 *
 * Real, load-bearing architectural constraint this is built against (found
 * by reading `three-gpu-pathtracer`'s own README before writing any code):
 * it hard-requires a classic `THREE.WebGLRenderer` and only supports
 * `MeshStandardMaterial`/`MeshPhysicalMaterial` — not the TSL/NodeMaterial
 * this app's live WebGPURenderer scene is built from (sky dome, water
 * plane, ground, section caps). User-approved scope for that gap
 * ("Convert what's feasible"):
 *   - GLB building/unit/glass meshes: included as-is. Confirmed by reading
 *     applyNodeOverrides/applyGlassPreset in RenderEngine.ts — these are
 *     already real `MeshStandardMaterial`/`MeshPhysicalMaterial` instances
 *     (GLTFLoader's own default, and applyGlassPreset's own construction),
 *     genuinely compatible, not approximated.
 *   - Ground: real `MeshStandardNodeMaterial` (TSL) — converted to a
 *     plain `MeshStandardMaterial` using its own live color uniform.
 *   - Sky dome / water plane / section caps/helpers / unit-status overlay
 *     boxes / construction-stage shells: all excluded. Not enumerated by
 *     name — they're excluded automatically because every one of them
 *     uses either a NodeMaterial (sky/water) or `MeshBasicMaterial` (every
 *     other one — confirmed via glbUnitNodes.ts's applyUnitBoxMaterial and
 *     rebuildSectionCap's own material construction), and the inclusion
 *     filter below only accepts MeshStandardMaterial/MeshPhysicalMaterial.
 *     The sky is replaced with a flat fallback background color instead of
 *     literally nothing.
 *   - Real sun + ambient light: recreated as fresh classic Light instances
 *     copying the live ones' real color/intensity/position (the live
 *     lights stay in the real running scene — they're not reparented).
 *   - Real baked sky lighting: the same PMREM env render target the live
 *     WebGPU scene already uses for reflections/IBL is reused directly as
 *     `scene.environment`, not approximated a second way.
 *
 * Procedural (non-GLB) projects: their unit boxes are `MeshBasicMaterial`
 * status overlays, not real solid geometry (see glbUnitNodes.ts) — an
 * honest, accepted gap of this same filter, not special-cased around.
 * Those projects will path-trace mostly empty (ground + lighting only).
 */

export interface PathTraceSceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ground: THREE.Mesh | null;
  groundColor: THREE.Color | null;
  sun: THREE.DirectionalLight | null;
  ambient: THREE.AmbientLight | null;
  envTexture: THREE.Texture | null;
  exposure: number;
  width: number;
  height: number;
  /** Milliseconds to keep accumulating samples before reading the canvas
   * back out — the literal "(wait 10 seconds) then screenshot" the
   * feature was asked for; not a sample-count target (a slower GPU
   * legitimately converges less far in the same real-time window, which
   * is the expected, honest behavior of a progressive path tracer). */
  durationMs: number;
}

/** Builds the filtered, path-tracer-compatible clone scene described in
 * this module's own doc comment above. Exported separately from the
 * render function so it can be unit-reasoned-about (and, if ever needed,
 * tested) independently of the real async sample loop/canvas readback.
 * Returns the ground clone's material alongside the scene — the *only*
 * material this function ever constructs itself (every other clone
 * shares its material, and all clones share their geometry, by reference
 * with the live scene) — so the caller can dispose exactly that one
 * owned resource on teardown without having to search for it. */
function buildCompatibleScene(refs: PathTraceSceneRefs): { ptScene: THREE.Scene; ownedGroundMaterial: THREE.Material | null } {
  const ptScene = new THREE.Scene();
  let ownedGroundMaterial: THREE.Material | null = null;

  refs.scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat) return;
    const isGround = mesh === refs.ground;
    const compatible = mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial;
    if (!compatible && !isGround) return;

    // `clone(false)` — this mesh only, not a recursive subtree clone (we
    // traverse every mesh individually already, so a deep clone here
    // would double up nested meshes). Geometry is shared by reference
    // with the live scene (safe: three-gpu-pathtracer only reads it to
    // build a BVH, never mutates it) — only material is ever replaced
    // (ground only), and only with a freshly-constructed instance this
    // function owns.
    const clone = mesh.clone(false) as THREE.Mesh;
    if (isGround) {
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: refs.groundColor ?? new THREE.Color(0xd9d9d9),
        roughness: 1,
      });
      clone.material = groundMaterial;
      ownedGroundMaterial = groundMaterial;
    }
    // Cloning a mesh copies its own *local* transform, not its world
    // one — for anything nested inside a GLB's group hierarchy that's
    // the wrong space entirely once flattened onto `ptScene` directly.
    // Decompose the real matrixWorld instead so every clone lands in the
    // correct place regardless of how deep it was originally nested.
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    ptScene.add(clone);
  });

  if (refs.sun) {
    const sunClone = new THREE.DirectionalLight(refs.sun.color.clone(), refs.sun.intensity);
    sunClone.position.copy(refs.sun.position);
    ptScene.add(sunClone);
  }
  if (refs.ambient) {
    ptScene.add(new THREE.AmbientLight(refs.ambient.color.clone(), refs.ambient.intensity));
  }
  if (refs.envTexture) ptScene.environment = refs.envTexture;
  // Flat fallback — see this module's doc comment for why the physical
  // sky dome/HDRI itself can't render here. Reuses the live flat
  // background when one's already set (the studio_light/studio_dark
  // backgroundPreset branches), otherwise a neutral sky-blue stand-in.
  ptScene.background = refs.scene.background instanceof THREE.Color ? refs.scene.background.clone() : new THREE.Color(0xbcd6f0);

  return { ptScene, ownedGroundMaterial };
}

/** Runs the real progressive path-traced render and returns a PNG data
 * URL — dynamically imports `three-gpu-pathtracer` itself (see this
 * module's own doc comment for why). Never touches the live viewer's real
 * renderer/scene/camera; everything constructed here (canvas, WebGLRenderer,
 * cloned scene, cloned camera) is torn down before returning. */
export async function renderPathTraceScreenshot(refs: PathTraceSceneRefs): Promise<string> {
  const { WebGLPathTracer } = await import("three-gpu-pathtracer");

  const { ptScene, ownedGroundMaterial } = buildCompatibleScene(refs);

  const canvas = document.createElement("canvas");
  canvas.width = refs.width;
  canvas.height = refs.height;
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = refs.exposure;
  renderer.setSize(refs.width, refs.height, false);

  const ptCamera = refs.camera.clone();
  ptCamera.aspect = refs.width / refs.height;
  ptCamera.updateProjectionMatrix();

  // Matches the reference demo's own config (filterGlossyFactor: 1,
  // minSamples: 3) — not exposed as admin settings, this is a fixed
  // "best effort in the real-time window" preset, not a tunable feature.
  const pathTracer = new WebGLPathTracer(renderer);
  pathTracer.filterGlossyFactor = 1;
  pathTracer.minSamples = 3;
  pathTracer.renderScale = 1;
  pathTracer.setScene(ptScene, ptCamera);

  const start = performance.now();
  await new Promise<void>((resolve) => {
    const step = () => {
      pathTracer.renderSample();
      if (performance.now() - start >= refs.durationMs) resolve();
      else requestAnimationFrame(step);
    };
    step();
  });

  const dataUrl = canvas.toDataURL("image/png");

  pathTracer.dispose();
  renderer.dispose();
  // Only the ground clone's material is an instance this function
  // constructed itself (returned directly from buildCompatibleScene,
  // above) — every other clone shares its material, and all clones share
  // their geometry, by reference with the live scene, so disposing those
  // here would break the real running viewer.
  ownedGroundMaterial?.dispose();

  return dataUrl;
}
