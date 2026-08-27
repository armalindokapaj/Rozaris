import * as THREE from "three/webgpu";
import { convertToTexture, float, getViewPosition, int, metalness, mix, mrt, normalView, output, pass, roughness, smoothstep, texture3D, uniform, uv, vec3, vec4, velocity } from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { ssgi } from "three/examples/jsm/tsl/display/SSGINode.js";
import { godrays } from "three/examples/jsm/tsl/display/GodraysNode.js";
import { bilateralBlur } from "three/examples/jsm/tsl/display/BilateralBlurNode.js";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { lensflare } from "three/examples/jsm/tsl/display/LensflareNode.js";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { motionBlur } from "three/examples/jsm/tsl/display/MotionBlur.js";
import { lut3D } from "three/examples/jsm/tsl/display/Lut3DNode.js";
import type { LightingConfig, RenderingConfig } from "@/lib/types";
import { getLutResource } from "./lut";

/**
 * The shared WebGPU render graph (PRD §43) — ONE scene MRT pass, extended
 * by both the Lighting tab (Contact Shadows/GI/Sun Shafts, PRD §17/19/21,
 * this module's original Phase-3 build) and the Rendering tab
 * (Reflections/Anti-Aliasing/Camera FX/Color, PRD §22-33, this Phase-4
 * extension) — not two separate pipelines double-rendering the scene.
 * Every node/composite call is the EXACT canonical usage shown in each
 * node's own vendored doc comment — not guessed at. See this module's
 * git history (Phase 3) for the Contact Shadows/GI/Sun Shafts half.
 *
 * Rendering tab additions, in chain order:
 * 1. Reflections (real `SSRNode`, single-bounce mirror+roughness-blur
 *    mode — reflects the RAW beauty pass, not the Contact-Shadow/GI-
 *    composited one, both because SSRNode's own `.sample()` calls need a
 *    real texture-backed colorNode (no `convertToTexture` wrapping in its
 *    factory, unlike SSGI's) and because excluding screen-space AO/GI
 *    from what gets reflected avoids visible double-darkening seams — a
 *    real, deliberate, simpler trade, same category as this file's
 *    Godrays/depthAwareBlend trade below). `reflectNonMetals: true` is
 *    fixed (not admin-exposed) so dielectric surfaces (glass, polished
 *    floors) actually show a reflection too, not just literal metal
 *    materials — ssrIntensity/ssrMaxDistance/ssrThickness/ssrQuality are
 *    the real admin-tunable knobs. No equirect HDR environment map is
 *    wired in (this app's sky is a procedural SkyMesh, not a CPU-side
 *    `image.data` HDR texture SSRNode's optional env-reflection fallback
 *    needs) — screen-space misses just contribute nothing, an honest
 *    simplification.
 * 2. TRAA (temporal reprojection AA) — replaces `antialiasEnabled`'s old
 *    browser-MSAA-only meaning; the renderer is constructed with
 *    `antialias: false` whenever this is on (RenderEngine.ts), per
 *    TRAANode's own doc note ("MSAA must be disabled when TRAA is in
 *    use").
 * 3. Depth of Field (real `DepthOfFieldNode`) — focusDistance is a live
 *    uniform RenderEngine.ts updates every frame from the real camera-to-
 *    orbit-target distance (real auto-focus, not a manual distance that
 *    would drift as a visitor orbits), gated by `cameraAutoFocusEnabled`.
 * 3b. Distance Blur (depth-masked `gaussianBlur`) — a SEPARATE stage from
 *    Depth of Field, not a mode of it. `dof()`'s circle-of-confusion is
 *    symmetric around one focus plane, and this app auto-focuses that plane
 *    on the live camera-to-orbit-target distance, so it can't express "the
 *    building stays sharp, everything past N metres goes soft" — pull back
 *    and the whole frame blurs. This stage masks a blurred copy of the
 *    chain by absolute view distance instead, so the near field is never
 *    touched at any orbit distance. Runs AFTER TRAA (blurring before
 *    temporal reprojection would feed the history buffer already-soft
 *    pixels and smear the sharp foreground into them) and BEFORE Bloom, so
 *    softened distant highlights bloom softly too.
 * 4. Bloom (real `BloomNode`, already-existing fields reused) — Lens
 *    Flare (`LensflareNode`) reads Bloom's own bright-pass texture as its
 *    light source per the node's own doc comment ("requires that you
 *    extract the bloom of the scene via a bloom pass first"), so it only
 *    ever renders when Bloom is also on (the Rendering panel's own UI
 *    enforces this dependency rather than silently building a second,
 *    redundant bloom pass just for Lens Flare).
 * 5. Motion Blur (real `motionBlur()` TSL fn sampling the scene's own MRT
 *    velocity buffer) — `motionBlurIntensity` scales the velocity vector
 *    itself (a real, physically-meaningful "smear length" control) rather
 *    than exposing the fn's own sample count (a shader-recompile-on-
 *    change JS-level Loop bound, fixed at 16 — same "avoid shader
 *    recompilation on a live slider" discipline the Sections/Clouds
 *    modules already established).
 * 6. 3D LUT color grading (real `Lut3DNode`) — applied last, matching the
 *    reference demo's own OutputPass -> LUTPass ordering (this file's
 *    pre-existing doc comment). The LUT texture itself loads async
 *    (render-engine/lut.ts) — while a newly-selected preset is still
 *    loading, this build simply omits the LUT stage for a few frames
 *    rather than blocking; RenderEngine.ts re-applies once it resolves.
 *
 * Tone mapping/exposure (`renderer.toneMapping`/`toneMappingExposure`)
 * are plain renderer properties, not part of this node graph — applied
 * directly in RenderEngine.ts, live, no rebuild.
 */
type UniformNode = ReturnType<typeof uniform>;

/** A few of these vendored TSL display nodes' plain-JS class bodies don't
 * fully infer through TS's allowJs/no-checkJs JSDoc inference (their
 * `getTextureNode()` accessor comes back missing from the inferred type,
 * or a constructor param comes back over-strict) even though the runtime
 * shape is exactly as documented — verified directly against each
 * module's own source (TRAANode.js/BloomNode.js/DepthOfFieldNode.js all
 * genuinely define `getTextureNode()`). Same narrow-cast pattern this
 * codebase already uses for RectAreaLightNode.setLTC's own type
 * mismatch, not a blanket `any`. */
function textureNodeOf(node: unknown): THREE.Node<"vec4"> {
  return (node as { getTextureNode(): THREE.Node<"vec4"> }).getTextureNode();
}

export interface ScenePostPipeline {
  pipeline: THREE.RenderPipeline;
  /** Live per-frame handle — RenderEngine.ts's render loop writes the
   * real camera-to-orbit-target distance into this every frame (real
   * auto-focus). Null when Depth of Field isn't structurally active. */
  dofFocusDistance: UniformNode | null;
  /** Live per-frame handles for Distance Blur's building-anchored mask —
   * RenderEngine.ts writes the CURRENT content centre and bounding radius
   * into these every frame, the same way it writes `dofFocusDistance`.
   * They can't be baked at build time: a Replace-model / newly-finished
   * GLB load moves both (frameLoadedContent()), and a pipeline rebuild is
   * only triggered by WHICH effects are active, never by content changing.
   * Null when Distance Blur isn't structurally active. */
  distanceBlurAnchor: { center: UniformNode; buildingRadius: UniformNode } | null;
  update: (lighting: LightingConfig, rendering: RenderingConfig) => void;
  dispose: () => void;
}

/** The structural signature RenderEngine.ts compares to decide "rebuild
 * the whole pipeline" (which effects are active, and which MRT channels
 * they need) vs "just push new uniform values" — every numeric slider
 * inside an already-active effect is the latter. Exported so
 * RenderEngine.ts's own `scenePostSignature` field stays in exact sync
 * with what this module actually keys a rebuild on. */
export function computeScenePostSignature(lighting: LightingConfig, rendering: RenderingConfig): string {
  const lutReady = rendering.lutEnabled && getLutResource(rendering.lutPreset) != null;
  return [
    lighting.contactShadowsEnabled ? 1 : 0,
    lighting.giEnabled ? 1 : 0,
    lighting.volumetricLightingEnabled && lighting.sunShaftsEnabled ? 1 : 0,
    rendering.ssrEnabled ? 1 : 0,
    rendering.antialiasEnabled ? 1 : 0,
    rendering.depthOfFieldEnabled ? 1 : 0,
    rendering.distanceBlurEnabled ? 1 : 0,
    rendering.bloomEnabled ? 1 : 0,
    rendering.bloomEnabled && rendering.lensFlareEnabled ? 1 : 0,
    rendering.motionBlurEnabled ? 1 : 0,
    lutReady ? `lut:${rendering.lutPreset}` : 0,
  ].join("|");
}

/** `smoothstep(edge0, edge1, x)` is undefined when the two edges meet, and
 * an admin dragging "Blur starts at" past "Fully blurred at" is a normal
 * thing to do mid-authoring — not an error state to reject. Nudging the far
 * edge instead degrades gracefully to a hard-ish cutoff at that distance,
 * which is a legitimate look, rather than producing NaN pixels. */
function resolveDistanceBlurFull(rendering: RenderingConfig): number {
  return Math.max(rendering.distanceBlurFullM, rendering.distanceBlurStartM + 0.5);
}

export function buildScenePostPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sun: THREE.DirectionalLight,
  lighting: LightingConfig,
  rendering: RenderingConfig
): ScenePostPipeline | null {
  const needsGI = lighting.giEnabled;
  const needsContact = lighting.contactShadowsEnabled;
  const needsVolumetric = lighting.volumetricLightingEnabled && lighting.sunShaftsEnabled;
  // Reflections are WebGPU-only, and not as a quality choice — three's own
  // `SSRNode` cannot compile on the WebGL2 backend. Its non-stochastic ray
  // march emits `max( int( trunc( ... ) ), 1.0 )` (SSRNode.js's `totalStep`),
  // which WGSL accepts and GLSL ES 3.00 does not: there is no int/float
  // overload of `max`, so the fragment shader fails to compile, the whole
  // post-processing program fails to link, and every subsequent frame draws
  // with an invalid program. The visible result is a dark viewer — reported
  // 2026-08-27 as "Time, Sun, Environment doesn't work correctly in Mobile
  // in my iPhone, it's dark", reproduced in real WebKit with `navigator.gpu`
  // removed, which is exactly an iPhone on iOS 18 or older (WebGPU only
  // ships in Safari 26 / iOS 26). Desktop Chrome and a desktop browser's
  // mobile-emulation mode both have WebGPU, which is why neither ever
  // showed it.
  //
  // Dropped rather than substituted: SSR's other branch (`stochastic: true`)
  // does compile, but its own docs call it noisy without a temporal or
  // spatial denoiser downstream, and this is already the degraded
  // fallback path on the weakest hardware — the honest fallback is no
  // screen-space reflections, not bad ones. Nothing else here needs a
  // guard; every other node in this chain was verified to compile on the
  // WebGL2 backend (`npm run test:webgl2-fallback`).
  // `Backend` does not declare the flag in three's own types even though
  // three's own internals branch on it (`renderer.backend.isWebGPUBackend
  // === true` appears verbatim in three.webgpu.js) — hence the cast rather
  // than a UA sniff or a second `navigator.gpu` probe, which would both be
  // guesses about a decision the renderer has already made.
  const isWebGPUBackend = (renderer.backend as unknown as { isWebGPUBackend?: boolean })?.isWebGPUBackend === true;
  const needsSSR = rendering.ssrEnabled && isWebGPUBackend;
  const needsTRAA = rendering.antialiasEnabled;
  const needsDOF = rendering.depthOfFieldEnabled;
  const needsDistanceBlur = rendering.distanceBlurEnabled;
  const needsBloom = rendering.bloomEnabled;
  const needsLensFlare = needsBloom && rendering.lensFlareEnabled;
  const needsMotionBlur = rendering.motionBlurEnabled;
  const lutResource = rendering.lutEnabled ? getLutResource(rendering.lutPreset) : null;
  const needsLut = lutResource != null;
  if (!needsGI && !needsContact && !needsVolumetric && !needsSSR && !needsTRAA && !needsDOF && !needsDistanceBlur && !needsBloom && !needsMotionBlur && !needsLut) {
    return null;
  }

  const needsNormal = needsContact || needsGI || needsSSR;
  const needsVelocity = needsTRAA || needsMotionBlur;

  // Real bug this avoids (live-caught during Phase 4 stress testing):
  // every MRT channel gets its own full RGBA16Float attachment regardless
  // of the node's own logical component count (confirmed via WebGPU's own
  // "Total color attachment bytes per sample" validation error) — with
  // Reflections + Anti-Aliasing/Motion Blur all structurally active at
  // once, output+normal+metalness+roughness+velocity is 5 attachments ×
  // 8 bytes = 40, exceeding the 32-byte/sample floor EVERY conformant
  // WebGPU implementation is only guaranteed to support (this app doesn't
  // request a higher adapter-specific limit — same conservative,
  // works-everywhere posture as the rest of this render graph, given this
  // project's own history of real GPU-adapter instability). Packing
  // metalness+roughness into ONE combined channel (.r/.g of the same
  // texture) keeps the worst case at 4 attachments = 32 bytes exactly,
  // never over.
  const needsMetalRough = needsSSR;

  const scenePass = pass(scene, camera);
  scenePass.setMRT(
    mrt({
      output,
      ...(needsNormal ? { normal: normalView } : {}),
      ...(needsMetalRough ? { metalRough: vec4(metalness, roughness, 0, 0) } : {}),
      ...(needsVelocity ? { velocity } : {}),
    })
  );
  const colorNode = scenePass.getTextureNode("output");
  const depthNode = scenePass.getTextureNode("depth");
  const normalNode = needsNormal ? scenePass.getTextureNode("normal") : null;

  let chain: THREE.Node<"vec4"> = colorNode;

  // --- Lighting tab: Contact Shadows / GI / Sun Shafts (Phase 3, unchanged) ---
  let gtaoNode: ReturnType<typeof ao> | null = null;
  if (needsContact && normalNode) {
    gtaoNode = ao(depthNode, normalNode, camera);
    gtaoNode.radius.value = Math.max(0.02, lighting.contactShadowRange);
    const aoTerm = gtaoNode.getTextureNode().r;
    const darkened = vec3(1).sub(vec3(1).sub(aoTerm).mul(lighting.contactShadowDarkness));
    chain = chain.mul(vec4(darkened, 1));
  }

  let ssgiInstance: ReturnType<typeof ssgi> | null = null;
  if (needsGI && normalNode) {
    ssgiInstance = ssgi(chain, depthNode, normalNode, camera);
    ssgiInstance.sliceCount.value = lighting.giSliceCount;
    ssgiInstance.stepCount.value = lighting.giStepCount;
    ssgiInstance.aoIntensity.value = lighting.giAOEnabled ? lighting.giAOIntensity : 0;
    ssgiInstance.giIntensity.value = lighting.giIndirectEnabled ? lighting.giIntensity : 0;
    ssgiInstance.radius.value = lighting.giRadius;
    ssgiInstance.useScreenSpaceSampling.value = lighting.giScreenSpaceSampling;
    ssgiInstance.expFactor.value = lighting.giExpFactor;
    ssgiInstance.thickness.value = lighting.giThickness;
    ssgiInstance.useLinearThickness.value = lighting.giLinearThickness;
    ssgiInstance.backfaceLighting.value = lighting.giBackfaceLighting ? 1 : 0;

    const giTerm = ssgiInstance.getGINode();
    const ssgiAoTerm = ssgiInstance.getAONode().r;
    chain = chain.add(giTerm).mul(vec4(vec3(ssgiAoTerm), 1));
  }

  if (needsVolumetric) {
    const raw = godrays(depthNode, camera, sun);
    raw.density.value = lighting.volumetricDensity;
    raw.maxDensity.value = lighting.volumetricMaxDensity;
    raw.distanceAttenuation.value = lighting.volumetricDistanceAtten;
    raw.raymarchSteps.value = lighting.volumetricRaymarchSteps;
    const blurredGodrays = bilateralBlur(raw).getTextureNode();
    chain = chain.add(blurredGodrays.mul(vec3(1, 0.96, 0.88)));
  }

  // --- Rendering tab: Reflections (Phase 4) ---
  let ssrNode: ReturnType<typeof ssr> | null = null;
  if (needsSSR && normalNode) {
    const metalRoughTexture = scenePass.getTextureNode("metalRough");
    const metalnessNode = metalRoughTexture.r;
    const roughnessNode = metalRoughTexture.g;
    ssrNode = ssr(colorNode, depthNode, normalNode as unknown as THREE.Node<"vec3">, {
      metalnessNode,
      roughnessNode,
      reflectNonMetals: true,
      camera,
    });
    ssrNode.maxDistance.value = rendering.ssrMaxDistance;
    ssrNode.thickness.value = rendering.ssrThickness;
    ssrNode.intensity.value = rendering.ssrIntensity;
    ssrNode.quality.value = rendering.ssrQuality;
    chain = chain.add(vec4(ssrNode.getTextureNode().rgb, 0));
  }

  // --- Rendering tab: Anti-Aliasing (TRAA) ---
  let traaNode: ReturnType<typeof traa> | null = null;
  if (needsTRAA && needsVelocity) {
    const velocityNode = scenePass.getTextureNode("velocity");
    traaNode = traa(chain, depthNode, velocityNode, camera);
    chain = textureNodeOf(traaNode);
  }

  // --- Rendering tab: Camera FX — Distance Blur ---
  // Placed here deliberately: AFTER TRAA (feeding already-soft pixels into
  // the temporal history buffer smears the sharp foreground into them on
  // the next frame) and BEFORE Depth of Field/Bloom, so when both blur
  // stages are on they compose in the physically sensible order and
  // softened distant highlights bloom softly rather than as hard points.
  //
  // The mask is built from the SAME viewZ buffer DepthOfFieldNode reads —
  // distance along the camera's look direction, in real world units — so
  // `startM`/`fullM` are honest metres on every project. This is exactly
  // what Depth of Field cannot express here: `dof()`'s circle-of-confusion
  // is `smoothstep(0, focalLength, |viewZ - focus|)`, symmetric about the
  // focus plane, and RenderEngine.ts auto-focuses that plane on the live
  // camera-to-orbit-target distance — so orbiting out pushes the focus
  // plane out with the camera and the building softens along with the
  // background. A one-sided smoothstep on absolute distance never touches
  // the near field at any orbit distance.
  let distanceBlurNode: ReturnType<typeof gaussianBlur> | null = null;
  // Real uniforms, not baked constants — same trap this file's Lens
  // Flare/Motion Blur/LUT comment below documents: none of these four are
  // part of computeScenePostSignature(), so without live uniform handles
  // dragging their sliders after the pipeline is built would do nothing.
  // The kernel WIDTH (sigma) is the one thing that must stay a JS constant
  // — GaussianBlurNode unrolls `3 + 2 * sigma` taps at shader-build time,
  // so exposing it would recompile the shader on every slider tick (the
  // ~12s Section-activate freeze this codebase already had to fix once).
  // `radius` scales the tap SPACING instead, which is a live uniform, and
  // covers the same artistic range without a rebuild.
  // Held by REFERENCE to the camera's own live matrices (the exact trick
  // GodraysNode uses) — three already rewrites these objects in place every
  // frame, so there is nothing to copy per frame here. The built-in
  // `cameraWorldMatrix`/`cameraProjectionMatrixInverse` TSL nodes can't be
  // used: inside a post pass the bound camera is the internal full-screen
  // quad's orthographic one, not the scene camera.
  const cameraWorldMatrix = uniform(camera.matrixWorld);
  const cameraProjectionInverse = uniform(camera.projectionMatrixInverse);
  const distanceBlurCenter = uniform(new THREE.Vector3());
  const distanceBlurBuildingRadius = uniform(0);
  const distanceBlurStart = uniform(rendering.distanceBlurStartM);
  const distanceBlurFull = uniform(resolveDistanceBlurFull(rendering));
  const distanceBlurAmount = uniform(rendering.distanceBlurAmount);
  const distanceBlurRadius = uniform(rendering.distanceBlurRadius);
  if (needsDistanceBlur) {
    // One materialization of the chain so far, read twice (blurred + sharp)
    // rather than re-evaluating the whole upstream graph for each. A no-op
    // when `chain` is already a texture node (convertToTexture passes those
    // straight through), which it is whenever TRAA ran.
    const base = convertToTexture(chain);
    distanceBlurNode = gaussianBlur(base, distanceBlurRadius, 4, { resolutionScale: 0.5 });

    // Per-pixel WORLD position, then its distance to the building — not to
    // the camera. Measuring from the camera was tried first and is wrong
    // for this feature: a project's own start framing already sits well
    // past 150m out on a tall tower (cameraStartDistanceMultiplier x
    // boundingRadius, then offset diagonally), so a camera-relative
    // threshold put the BUILDING inside its own blur band — verified
    // live, the tower went soft while the ask was for the exact opposite.
    // Anchoring to the content centre instead makes "sharp within N
    // metres of the building" hold at every orbit distance, which is the
    // whole point of this stage over Depth of Field.
    //
    // Reconstructed from viewZ rather than from the raw depth texture on
    // purpose: `getViewPosition` reads a raw depth-buffer value, which is
    // encoded differently when Rendering -> `logarithmicDepthEnabled` is
    // on, whereas PassNode's viewZ is already linear world units either
    // way. So getViewPosition is used ONLY to get a point on this pixel's
    // view ray (any fixed depth does — the ray is what's wanted, not the
    // hit), and that ray is then rescaled to the real viewZ.
    const rayPoint = getViewPosition(uv(), float(0.5), cameraProjectionInverse);
    const viewPosition = rayPoint.mul(scenePass.getViewZNode().div(rayPoint.z));
    const worldPosition = cameraWorldMatrix.mul(viewPosition);
    // Measured from the building's bounding SPHERE, not its centre, so
    // "Sharp Until 150 m" reads as 150m of clear surroundings on a villa
    // and on a 40-storey tower alike — and so the building itself is
    // always <= 0 here, i.e. never blurred, by construction rather than
    // by an admin picking a big enough number.
    const distanceFromBuilding = worldPosition.distance(distanceBlurCenter).sub(distanceBlurBuildingRadius).max(0);
    const blurMask = smoothstep(distanceBlurStart, distanceBlurFull, distanceFromBuilding).mul(distanceBlurAmount);
    chain = vec4(mix(base.rgb, textureNodeOf(distanceBlurNode).rgb, blurMask), base.a);
  }

  // --- Rendering tab: Camera FX — Depth of Field ---
  let dofNode: ReturnType<typeof dof> | null = null;
  let dofFocusDistance: UniformNode | null = null;
  let dofFocalLength: UniformNode | null = null;
  let dofBokehScale: UniformNode | null = null;
  if (needsDOF) {
    dofFocusDistance = uniform(20);
    dofFocalLength = uniform(rendering.depthOfFieldFocalLength);
    dofBokehScale = uniform(rendering.depthOfFieldBokehScale);
    dofNode = dof(chain, scenePass.getViewZNode(), dofFocusDistance, dofFocalLength, dofBokehScale);
    chain = textureNodeOf(dofNode);
  }

  // --- Rendering tab: Camera FX — Bloom + Lens Flare ---
  let bloomNode: ReturnType<typeof bloom> | null = null;
  let lensflareNode: ReturnType<typeof lensflare> | null = null;
  // Real bug this avoids (live-caught): `float(x)`/a plain multiply with a
  // raw JS number bakes a CONSTANT into the shader graph, not a mutable
  // uniform — and none of lensFlareIntensity/motionBlurIntensity/
  // lutIntensity are part of computeScenePostSignature() either, so a
  // rebuild is never triggered by them changing. Without a real `uniform`
  // handle here, dragging any of these 3 sliders after the pipeline is
  // already built would silently do nothing. GTAO/SSGI/Godrays/SSR/Bloom/
  // DOF's own knobs avoid this because they read/write the node's own
  // pre-existing UniformNode properties (`.value =`) instead.
  const lensFlareIntensityUniform = uniform(rendering.lensFlareIntensity);
  if (needsBloom) {
    bloomNode = bloom(chain, rendering.bloomStrength, rendering.bloomRadius, 6);
    chain = chain.add(textureNodeOf(bloomNode));
    if (needsLensFlare) {
      lensflareNode = lensflare(textureNodeOf(bloomNode), {});
      chain = chain.add(textureNodeOf(lensflareNode).rgb.mul(lensFlareIntensityUniform));
    }
  }

  // --- Rendering tab: Camera FX — Motion Blur ---
  const motionBlurIntensityUniform = uniform(rendering.motionBlurIntensity);
  if (needsMotionBlur && needsVelocity) {
    const velocityNode = scenePass.getTextureNode("velocity");
    const scaledVelocity = velocityNode.mul(motionBlurIntensityUniform);
    chain = motionBlur(convertToTexture(chain), scaledVelocity, int(16));
  }

  // --- Rendering tab: Color — 3D LUT (always last) ---
  const lutIntensityUniform = uniform(rendering.lutIntensity);
  if (lutResource) {
    // A real 3D texture (Data3DTexture) needs the dedicated `texture3D()`
    // node — the general-purpose `texture()` builds a plain 2D sampler
    // and silently drops the z coordinate, a real bug this fixed (live-
    // caught: "no matching call to textureSample(texture_3d<f32>,
    // sampler, vec2<f32>)" — WGSL compile failure the moment LUT turned
    // on).
    const lutTextureNode = texture3D(lutResource.texture3D);
    chain = lut3D(chain, lutTextureNode, lutResource.size, lutIntensityUniform) as unknown as THREE.Node<"vec4">;
  }

  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputNode = chain;

  function update(lightingCfg: LightingConfig, renderingCfg: RenderingConfig) {
    if (gtaoNode) gtaoNode.radius.value = Math.max(0.02, lightingCfg.contactShadowRange);
    if (ssgiInstance) {
      ssgiInstance.sliceCount.value = lightingCfg.giSliceCount;
      ssgiInstance.stepCount.value = lightingCfg.giStepCount;
      ssgiInstance.aoIntensity.value = lightingCfg.giAOEnabled ? lightingCfg.giAOIntensity : 0;
      ssgiInstance.giIntensity.value = lightingCfg.giIndirectEnabled ? lightingCfg.giIntensity : 0;
      ssgiInstance.radius.value = lightingCfg.giRadius;
      ssgiInstance.useScreenSpaceSampling.value = lightingCfg.giScreenSpaceSampling;
      ssgiInstance.expFactor.value = lightingCfg.giExpFactor;
      ssgiInstance.thickness.value = lightingCfg.giThickness;
      ssgiInstance.useLinearThickness.value = lightingCfg.giLinearThickness;
      ssgiInstance.backfaceLighting.value = lightingCfg.giBackfaceLighting ? 1 : 0;
    }
    if (ssrNode) {
      ssrNode.maxDistance.value = renderingCfg.ssrMaxDistance;
      ssrNode.thickness.value = renderingCfg.ssrThickness;
      ssrNode.intensity.value = renderingCfg.ssrIntensity;
      ssrNode.quality.value = renderingCfg.ssrQuality;
    }
    distanceBlurStart.value = renderingCfg.distanceBlurStartM;
    distanceBlurFull.value = resolveDistanceBlurFull(renderingCfg);
    distanceBlurAmount.value = renderingCfg.distanceBlurAmount;
    distanceBlurRadius.value = renderingCfg.distanceBlurRadius;
    if (dofFocalLength) dofFocalLength.value = renderingCfg.depthOfFieldFocalLength;
    if (dofBokehScale) dofBokehScale.value = renderingCfg.depthOfFieldBokehScale;
    if (bloomNode) {
      bloomNode.strength.value = renderingCfg.bloomStrength;
      bloomNode.radius.value = renderingCfg.bloomRadius;
    }
    lensFlareIntensityUniform.value = renderingCfg.lensFlareIntensity;
    motionBlurIntensityUniform.value = renderingCfg.motionBlurIntensity;
    lutIntensityUniform.value = renderingCfg.lutIntensity;
  }

  // Real GPU-memory leak this fixes (live-caught via an inflated
  // "Draw calls"/GPU-memory reading under rapid toggling): SSRNode/
  // TRAANode/BloomNode/DepthOfFieldNode/LensflareNode each own SEVERAL
  // internal RenderTargets (their own multi-pass blur/composite chain) —
  // every one of them needs its own `.dispose()` on rebuild, not just
  // GTAO/SSGI's. Lut3DNode/motionBlur() have no internal render target
  // (single-pass color-transform nodes), so nothing to dispose there.
  function dispose() {
    pipeline.dispose();
    gtaoNode?.dispose();
    ssgiInstance?.dispose();
    ssrNode?.dispose();
    traaNode?.dispose();
    dofNode?.dispose();
    distanceBlurNode?.dispose();
    bloomNode?.dispose();
    lensflareNode?.dispose();
  }

  return {
    pipeline,
    dofFocusDistance,
    distanceBlurAnchor: needsDistanceBlur ? { center: distanceBlurCenter, buildingRadius: distanceBlurBuildingRadius } : null,
    update,
    dispose,
  };
}
