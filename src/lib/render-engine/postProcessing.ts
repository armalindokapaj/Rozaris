import * as THREE from "three/webgpu";
import { convertToTexture, int, metalness, mrt, normalView, output, pass, roughness, texture3D, uniform, vec3, vec4, velocity } from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { ssgi } from "three/examples/jsm/tsl/display/SSGINode.js";
import { godrays } from "three/examples/jsm/tsl/display/GodraysNode.js";
import { bilateralBlur } from "three/examples/jsm/tsl/display/BilateralBlurNode.js";
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
    rendering.bloomEnabled ? 1 : 0,
    rendering.bloomEnabled && rendering.lensFlareEnabled ? 1 : 0,
    rendering.motionBlurEnabled ? 1 : 0,
    lutReady ? `lut:${rendering.lutPreset}` : 0,
  ].join("|");
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
  const needsSSR = rendering.ssrEnabled;
  const needsTRAA = rendering.antialiasEnabled;
  const needsDOF = rendering.depthOfFieldEnabled;
  const needsBloom = rendering.bloomEnabled;
  const needsLensFlare = needsBloom && rendering.lensFlareEnabled;
  const needsMotionBlur = rendering.motionBlurEnabled;
  const lutResource = rendering.lutEnabled ? getLutResource(rendering.lutPreset) : null;
  const needsLut = lutResource != null;
  if (!needsGI && !needsContact && !needsVolumetric && !needsSSR && !needsTRAA && !needsDOF && !needsBloom && !needsMotionBlur && !needsLut) {
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
    bloomNode?.dispose();
    lensflareNode?.dispose();
  }

  return { pipeline, dofFocusDistance, update, dispose };
}
