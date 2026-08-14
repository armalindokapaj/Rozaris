import * as THREE from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  Break,
  Discard,
  texture3D,
  positionLocal,
  cameraPosition,
  modelWorldMatrixInverse,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  int,
  hash,
  screenCoordinate,
  smoothstep,
  min,
  max,
  color,
} from "three/tsl";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";

/**
 * A second, genuinely different cloud implementation (`webgl_volume_cloud.html`
 * parity) — real 3D-texture raymarching through a box volume, deliberately
 * kept alongside the existing procedural sky-dome clouds (SkyMesh's own
 * coverage/density/elevation uniforms — see RenderEngine.ts's
 * rebuildEnvironment) rather than replacing them, per explicit user
 * request ("add this cloud to another tab, we will test both of it").
 *
 * The reference demo's own fragment shader is raw GLSL3 on a
 * `RawShaderMaterial` — a classic-WebGLRenderer-only material type,
 * incompatible with this app's WebGPURenderer node-material pipeline as-is.
 * Hand-ported to TSL below, function-for-function against the fetched
 * reference source (hitBox/sample1/shading/the raymarch loop/the same
 * threshold-range-opacity-steps math) — no ready-made TSL node exists for
 * this technique, unlike bloom/motionBlur/lut3D/dof earlier this session.
 * Two deliberate, disclosed deviations from the reference source:
 *   - `linearToSRGB`'s manual OETF is dropped — `RawShaderMaterial` bypasses
 *     three.js's own output color-space handling entirely (why the demo
 *     needs to do it by hand); this material goes through the normal node
 *     pipeline's own automatic output conversion instead, so re-applying it
 *     here would double-encode.
 *   - The demo's own hand-rolled `wang_hash`/`randomFloat` dither is
 *     replaced with TSL's built-in `hash()` node (same purpose — a cheap
 *     per-fragment per-frame random offset that breaks up raymarch-step
 *     banding — not a faithful port of the exact bit-mixing, just an
 *     equivalent one already provided by three.js itself).
 *
 * `Discard()`/`If(...).Else(...)` control-flow shape confirmed against a
 * real installed usage (`RecurrentDenoiseNode.js`) before writing this,
 * not guessed; `Break()` inside a `Loop`+`If` confirmed against
 * `SSRNode.js`'s own real usage the same way.
 */

const NOISE_TEXTURE_SIZE = 128;

/** CPU-generated 3D Perlin-noise density texture — byte-for-byte the same
 * generation formula as the reference demo (ImprovedNoise, same scale/
 * radial-falloff shaping), just ported from its inline script to a real,
 * reusable function. A real, if fairly heavy, one-time cost (128³ = ~2.1M
 * loop iterations) — only ever called when `volumetricCloudEnabled` is
 * actually on, and only once per mount (RenderEngine.ts caches the result,
 * see its own field doc comment). */
export function buildVolumetricCloudNoiseTexture(size = NOISE_TEXTURE_SIZE): THREE.Data3DTexture {
  const data = new Uint8Array(size * size * size);
  const perlin = new ImprovedNoise();
  const vector = new THREE.Vector3();
  const scale = 0.05;
  let i = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = 1 - vector.set(x, y, z).subScalar(size / 2).divideScalar(size).length();
        data[i] = (128 + 128 * perlin.noise((x * scale) / 1.5, y * scale, (z * scale) / 1.5)) * d * d;
        i++;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export interface VolumetricCloudUniforms {
  threshold: ReturnType<typeof uniform>;
  opacity: ReturnType<typeof uniform>;
  range: ReturnType<typeof uniform>;
  steps: ReturnType<typeof uniform>;
  frame: ReturnType<typeof uniform>;
}

/** Builds the real raymarching NodeMaterial + its 5 live uniforms
 * (threshold/opacity/range/steps mirror the reference demo's own GUI
 * exactly; `frame` is the same per-frame dither-seed increment the demo's
 * own `animate()` bumps every render). `baseColorHex` mirrors the demo's
 * hardcoded `0x798aa0` — not exposed as an admin field, same "don't invent
 * a control the reference GUI doesn't have" discipline this session's
 * other TSL ports already follow. */
export function buildVolumetricCloudMaterial(
  noiseTexture: THREE.Data3DTexture,
  baseColorHex = 0x798aa0
): { material: THREE.NodeMaterial; uniforms: VolumetricCloudUniforms } {
  const threshold = uniform(0.25);
  const opacity = uniform(0.25);
  const range = uniform(0.1);
  const steps = uniform(100);
  const frame = uniform(0);
  const base = color(baseColorHex);
  const map = texture3D(noiseTexture);

  // TSL's own generated node types (VarNode<"vec3", JoinNode<"vec3">>
  // etc.) are too specific/mutually-incompatible to write a clean shared
  // parameter type for by hand across every real call-site shape below
  // (vec3() literals vs. .toVar() vars vs. .sub()/.add() expression
  // nodes) — the same class of TSL/tsc friction already worked around
  // elsewhere this session (see buildRenderPipeline's
  // `as unknown as THREE.Node<"vec4">` cast), just on function params
  // instead of a variable assignment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hitBox = (orig: any, dir: any) => {
    const boxMin = vec3(-0.5, -0.5, -0.5);
    const boxMax = vec3(0.5, 0.5, 0.5);
    const invDir = vec3(1, 1, 1).div(dir);
    const tminTmp = boxMin.sub(orig).mul(invDir);
    const tmaxTmp = boxMax.sub(orig).mul(invDir);
    const tmin = min(tminTmp, tmaxTmp);
    const tmax = max(tminTmp, tmaxTmp);
    const t0 = max(tmin.x, max(tmin.y, tmin.z));
    const t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see hitBox's own comment above.
  const sample1 = (p: any) => map.sample(p).r;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see hitBox's own comment above.
  const shading = (coord: any) => {
    const s = 0.01;
    return sample1(coord.sub(vec3(s, s, s))).sub(sample1(coord.add(vec3(s, s, s))));
  };

  const fragmentNode = Fn(() => {
    // TSL equivalent of the reference shader's vertex-stage `vOrigin`/
    // `vDirection` varyings — computed directly in the fragment stage
    // instead, using positionLocal (the automatically-interpolated local-
    // space position TSL already provides) and the camera/model matrices,
    // rather than hand-writing a separate vertexNode just to pass the
    // same two values through as explicit varyings.
    const vOrigin = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz.toVar();
    const vDirection = positionLocal.sub(vOrigin).toVar();
    const rayDir = vDirection.normalize().toVar();
    const bounds = hitBox(vOrigin, rayDir).toVar();

    const result = vec4(0, 0, 0, 0).toVar();

    If(bounds.x.greaterThan(bounds.y), () => {
      Discard();
    }).Else(() => {
      bounds.x.assign(max(bounds.x, 0));
      const stepSize = bounds.y.sub(bounds.x).div(steps);

      // Per-fragment, per-frame dither offset — breaks up raymarch-step
      // banding, same purpose as the reference shader's own wang_hash
      // dither (see this module's own doc comment for why it's TSL's
      // built-in hash() here instead of a literal port of that function).
      const seed = screenCoordinate.x
        .mul(1973)
        .add(screenCoordinate.y.mul(9277))
        .add(frame.mul(26699));
      const randNum = hash(seed).mul(2).sub(1);

      const p = vOrigin.add(rayDir.mul(bounds.x)).toVar();
      p.addAssign(rayDir.mul(randNum).div(NOISE_TEXTURE_SIZE));

      const ac = vec4(base, 0).toVar();

      // Fixed compile-time loop bound (200 — matches the reference GUI's
      // own max) with a real, read-only comparison against the `steps`
      // uniform each iteration to decide when to stop — NOT a countdown
      // that mutates `steps` itself, which would corrupt the admin's
      // configured value on the very first fragment shaded.
      Loop({ start: int(0), end: int(200), type: "int", condition: "<" }, ({ i }) => {
        If(float(i).greaterThanEqual(steps), () => {
          Break();
        });
        const d = smoothstep(threshold.sub(range), threshold.add(range), sample1(p.add(0.5))).mul(opacity);
        const col = shading(p.add(0.5)).mul(3).add(p.x.add(p.y).mul(0.25)).add(0.2);
        const oneMinusA = float(1).sub(ac.a);
        ac.addAssign(vec4(vec3(oneMinusA.mul(d).mul(col)), oneMinusA.mul(d)));
        If(ac.a.greaterThanEqual(0.95), () => {
          Break();
        });
        p.addAssign(rayDir.mul(stepSize));
      });

      If(ac.a.equal(0), () => {
        Discard();
      }).Else(() => {
        result.assign(ac);
      });
    });

    return result;
  });

  const material = new THREE.NodeMaterial();
  material.fragmentNode = fragmentNode();
  material.side = THREE.BackSide;
  material.transparent = true;
  material.depthWrite = false;

  return { material, uniforms: { threshold, opacity, range, steps, frame } };
}
