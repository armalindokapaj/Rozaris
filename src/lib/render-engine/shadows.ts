import * as THREE from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import { color as tslColor, vec4 } from "three/tsl";
import { GLASS_NODE_PATTERN } from "@/lib/viewerPresets";
import type { LightingConfig } from "@/lib/types";

/**
 * Lighting → Shadows (PRD §16, `webgpu_shadowmap_csm.html` parity) — real
 * Cascaded Shadow Maps on the sun's `DirectionalLight`. `CSMShadowNode` is
 * a vendored, real three.js class (confirmed against `AnalyticLightNode`'s
 * own source: any light reads `light.shadow.shadowNode` if present and
 * uses it instead of its default single-frustum shadow — no other wiring
 * needed). CSM light DIRECTION comes from the Global Sun Vector (the real
 * `sun` DirectionalLight's own position/target) — never a separate
 * `lightX/Y/Z` per PRD §16's own "do not copy" note.
 */
export interface CSMSystem {
  node: InstanceType<typeof CSMShadowNode>;
  /** Call after mount and whenever the camera or CSM settings change. */
  updateFrustums: () => void;
  dispose: () => void;
}

export function buildCSMSystem(light: THREE.DirectionalLight, config: LightingConfig): CSMSystem {
  const node = new CSMShadowNode(light, {
    cascades: config.csmCascades,
    maxFar: config.csmMaxDistance,
    mode: config.csmSplitMode,
    lightMargin: config.csmMargin,
  });
  light.shadow.shadowNode = node;

  function updateFrustums() {
    // Real bug fix, live-tested: `node.camera` stays null until the WebGPU
    // node-builder's own lazy `_init({camera, renderer})` runs (the first
    // time the renderer actually processes this shadow node in a real
    // frame) — calling updateFrustums() before that (e.g. every frame in
    // the render loop, right after construction) crashes deep inside
    // CSMFrustum's own math on a null camera ("Cannot read properties of
    // null (reading 'far')"), repeating every frame. Guarding on
    // `node.camera` being set defers the first real update to whichever
    // frame actually initialized it — CSMShadowNode's own `mainFrustum`
    // stays null until then too, so cascades simply aren't ready for a
    // few frames rather than crashing.
    if (!node.camera || !node.mainFrustum) return;
    node.cascades = config.csmCascades;
    node.maxFar = config.csmMaxDistance;
    node.mode = config.csmSplitMode;
    node.lightMargin = config.csmMargin;
    node.updateFrustums();
  }

  function dispose() {
    if (light.shadow.shadowNode === node) light.shadow.shadowNode = undefined;
    node.dispose();
  }

  return { node, updateFrustums, dispose };
}

/**
 * Transmitted / Colored Shadows (PRD §18, `webgpu_shadowmap_opacity.html`
 * parity) — the exact real technique the reference demo uses:
 * `renderer.shadowMap.transmitted = true` + a per-material
 * `castShadowNode` returning a tinted, partial-alpha shadow color
 * (confirmed against `NodeMaterial`'s own doc comment and `Renderer.
 * _getShadowNodes`' real consumption of it) — applied to meshes matching
 * the existing `Glass_*` naming convention (GLASS_NODE_PATTERN,
 * viewerPresets.ts, the same convention Materials' glass-preset system
 * already uses). `coloredShadowsEnabled` picks the tint source (the
 * material's own color vs. a flat neutral gray); `transmittedShadowsEnabled`
 * is the master switch (colored shadows without transmission enabled just
 * doesn't apply — transmission IS what makes a shadow partial/tinted
 * instead of opaque black).
 */
export function applyTransmittedShadows(root: THREE.Object3D, config: LightingConfig) {
  const alpha = 1 - Math.max(0, Math.min(1, config.transmittedShadowStrength));
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !GLASS_NODE_PATTERN.test(mesh.name)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      const nodeMat = mat as THREE.MeshPhysicalMaterial & { castShadowNode?: THREE.Node<"vec4"> | null };
      if (!config.transmittedShadowsEnabled) {
        nodeMat.castShadowNode = null;
        continue;
      }
      const tint = config.coloredShadowsEnabled && nodeMat.color ? tslColor(nodeMat.color) : tslColor(0x808080);
      nodeMat.castShadowNode = vec4(tint, alpha);
    }
  });
}

/** Renderer-level switch `castShadowNode` requires — set once at mount,
 * matching PRD §18's own `renderer.shadowMap.transmitted` reference. */
export function setShadowMapTransmitted(renderer: THREE.WebGPURenderer, enabled: boolean) {
  renderer.shadowMap.transmitted = enabled;
}
