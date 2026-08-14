import * as THREE from "three/webgpu";
import { texture, positionWorld, time, materialEmissive, uniform, vec2, vec3, float } from "three/tsl";

/**
 * Unit-status caustics (`webgpu_caustics.html` parity) — real vendored
 * caustics texture (`Caustic_Free.jpg`, the reference demo's own asset,
 * same "vendor the demo's real asset" precedent as Water's waternormals.jpg
 * and the 3D LUT `.cube` files), sampled with a chromatic-aberration-style
 * per-channel UV offset, same as the reference. Explicitly linked to all 3
 * things the user asked for ("Availability, color, caustics properties.
 * everything possible."):
 *   - **color** reuses the real per-project `unitColor*` fields (no
 *     separate caustics-color fields — RenderEngine.ts resolves this via
 *     `resolveUnitColors()`, same source of truth the unit boxes
 *     themselves already use).
 *   - **availability** drives per-status intensity
 *     (`causticsIntensityAvailable`/`Reserved`/`Sold`) — real admin
 *     sliders, not a hardcoded ratio.
 *   - **caustics properties** — scale (UV tiling) and speed (scroll
 *     animation) are real admin sliders too.
 *
 * Two disclosed, deliberate deviations from the reference's own technique
 * (found by reading its real fetched source before writing any code):
 *   - The reference drives its caustic UV from a `refract()` vector based
 *     on each fragment's view-dependent surface normal, and injects the
 *     result via `material.castShadowNode` (a colored/patterned *shadow*,
 *     requiring `renderer.shadowMap.transmitted = true` — a global,
 *     scene-wide renderer flag with real side effects on every other
 *     shadow-casting transmissive material, e.g. this app's own glass).
 *     That combination is built for a single hero object (a duck) with
 *     richly varying normals and a close camera — not this app's small,
 *     flat-faced, per-unit boxes, and the shadow-map-wide side effect is
 *     real risk this session has no browser to verify against. Adapted
 *     instead to a world-space planar UV (`positionWorld.xz`, the same
 *     basis the ground fog effect already uses) sampled directly into the
 *     surface's own emissive color — visible on the unit itself, not
 *     hidden in a shadow, which is also the more useful "highlight this
 *     available unit" signal for this app.
 *   - The reference's caustic texture is static (no animation — only the
 *     duck rotates). A real UV-scroll animation (driven by TSL's own
 *     self-updating `time` uniform) is added here instead, since a
 *     shimmering/moving pattern is what "caustics" are expected to look
 *     like, and gives the `causticsSpeed` admin slider real meaning.
 *
 * Applied via `material.emissiveNode` (adds on top of `materialEmissive`,
 * which already composes the material's own live `.emissive`/
 * `.emissiveIntensity` — confirmed against MaterialNode.js's own doc
 * comment — so this doesn't fight the existing hover/selection highlight,
 * which also drives those same properties). Only exists on real
 * `NodeMaterial` subclasses (confirmed against NodeMaterial.js: `colorNode`/
 * `emissiveNode` aren't defined on the plain `Material` base class at
 * all) — RenderEngine.ts upgrades each procedural unit's material to
 * `MeshStandardNodeMaterial` when caustics is enabled, mirroring the same
 * upgrade pattern already used for clearcoat/iridescence node overrides.
 */

/** Loads the real vendored caustics texture — call once per mount, not
 * once per unit. `RepeatWrapping` matches the reference's own setup so
 * the tiled/animated UV sampling doesn't clamp at the texture edges. */
export function loadCausticsTexture(): THREE.Texture {
  const texture = new THREE.TextureLoader().load("/textures/caustics/Caustic_Free.jpg");
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Typed by their `.value` shape directly (not `ReturnType<typeof
// uniform>`) — that generic collapses `.value` to `unknown` without the
// call-site argument type to infer from, same precedent RenderEngine.ts's
// own `groundColorUniform` field already established.
export interface CausticsUnitUniforms {
  color: { value: THREE.Color };
  intensity: { value: number };
}

/** Builds one unit's real emissiveNode. `scaleUniform`/`speedUniform` are
 * shared across every unit (created once per mount by RenderEngine.ts,
 * see its own `causticsScale`/`causticsSpeed` fields) — `color`/
 * `intensity` are fresh per-unit uniforms this function creates, since
 * those genuinely vary per unit by status.
 *
 * `scaleUniform`/`speedUniform` are typed `any` deliberately: TSL's own
 * generated node types (UniformNode<unknown,unknown> losing its generic
 * across this function boundary, then failing `.mul()`'s overload
 * resolution) are too specific to write a clean parameter type for by
 * hand — same class of TSL/tsc friction already worked around elsewhere
 * this session (volumetricCloud.ts's hitBox/sample1/shading helpers). */
export function buildCausticsUnitEmissiveNode(
  causticsTexture: THREE.Texture,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scaleUniform: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  speedUniform: any,
  initialColorHex: number,
  initialIntensity: number
) {
  const color = uniform(new THREE.Color(initialColorHex));
  const intensity = uniform(initialIntensity);

  // float(...) normalizes the `any`-typed params into a definite
  // Node<"float"> — without it, tsc's overload resolution for the
  // chained `.mul()` calls below picks an unrelated overload (observed
  // resolving to Node<"vec3">, presumably the first structurally-
  // compatible one when an argument is untyped `any`) instead of staying
  // permissive.
  const scale = float(scaleUniform);
  const speed = float(speedUniform);
  const baseUV = positionWorld.xz.mul(scale);
  const scroll = vec2(time.mul(speed), time.mul(speed).mul(0.7));
  const animatedUV = baseUV.add(scroll);

  // Same small fixed-offset chromatic-aberration idea as the reference
  // (there it's view-angle-dependent via normalView.z; here it's a fixed
  // constant, appropriate for this app's flat unit-box faces which don't
  // have the duck's continuously-varying surface normal to key off of).
  const aberration = 0.01;
  const causticProjection = vec3(
    texture(causticsTexture, animatedUV.add(vec2(aberration, 0))).r,
    texture(causticsTexture, animatedUV).g,
    texture(causticsTexture, animatedUV.sub(vec2(aberration, 0))).b
  );

  const emissiveNode = materialEmissive.add(causticProjection.mul(color).mul(intensity));

  return { emissiveNode, uniforms: { color, intensity } };
}
