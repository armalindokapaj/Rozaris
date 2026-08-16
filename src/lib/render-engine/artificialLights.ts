import * as THREE from "three/webgpu";
import { IESSpotLight, RectAreaLightNode } from "three/webgpu";
import { IESLoader } from "three/examples/jsm/loaders/IESLoader.js";
import { RectAreaLightTexturesLib } from "three/examples/jsm/lights/RectAreaLightTexturesLib.js";
import { RectAreaLightHelper } from "three/examples/jsm/helpers/RectAreaLightHelper.js";
import type { ArtificialLight } from "@/lib/types";

let rectAreaLibInited = false;
/** Real bug fix, live-tested: `RectAreaLightUniformsLib.init()` (the
 * classic helper this three.js version still ships) only populates the
 * legacy WebGLRenderer-era `UniformsLib` global — its own doc comment
 * says so explicitly ("only relevant when using RectAreaLight with
 * WebGLRenderer"). Under WebGPURenderer's TSL lighting model,
 * `RectAreaLightNode` reads its LTC BRDF-approximation textures from a
 * SEPARATE internal static (`_ltcLib`, set via `RectAreaLightNode.
 * setLTC()`) that the classic helper never touches — using it alone
 * crashed every frame ("Cannot read properties of null (reading
 * 'LTC_FLOAT_1')"). The real fix: `RectAreaLightTexturesLib.init()` (the
 * texture data itself) + `RectAreaLightNode.setLTC(RectAreaLightTexturesLib)`
 * (wiring it into the WebGPU node system). */
function ensureRectAreaLightSupport() {
  if (rectAreaLibInited) return;
  RectAreaLightTexturesLib.init();
  // RectAreaLightTexturesLib.init() sets LTC_FLOAT_1/2/HALF_1/2 as real
  // STATIC properties on the class itself (confirmed against
  // RectAreaLightUniformsLib.js's own identical destructuring pattern) —
  // setLTC()'s own .d.ts types its param as an unrelated same-named
  // instance shape (two separate ambient type declarations), a
  // declaration-only mismatch, not a runtime one.
  RectAreaLightNode.setLTC(RectAreaLightTexturesLib as unknown as Parameters<typeof RectAreaLightNode.setLTC>[0]);
  rectAreaLibInited = true;
}

interface LightEntry {
  light: THREE.Light;
  helper: THREE.Object3D | null;
}

/**
 * Lighting → Artificial Lights (PRD §20) — real Point/Spot/IES-Spot/Rect-
 * Area light management. `IESSpotLight` (real `.iesMap`-bearing SpotLight
 * subclass) and `IESLoader` (real `.ies` photometric-profile parser) are
 * both genuine three.js/webgpu classes, not re-derived — confirmed
 * against `three/src/lights/webgpu/IESSpotLight.js`. RectAreaLight needs
 * its LTC BRDF-approximation textures wired into WebGPU's TSL lighting
 * model via `ensureRectAreaLightSupport()` (see its own doc comment for
 * a real bug this fixed — the classic `RectAreaLightUniformsLib.init()`
 * helper alone crashes every frame under WebGPURenderer).
 */
export class ArtificialLightSystem {
  private group: THREE.Group;
  private entries = new Map<string, LightEntry>();
  private iesLoader = new IESLoader();
  private iesCache = new Map<string, Promise<THREE.DataTexture | null>>();

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = "RZ_ArtificialLights";
    scene.add(this.group);
  }

  /** Adds/updates/removes real THREE light instances to match `defs` —
   * same "only touch what actually changed" discipline as
   * RenderEngine.syncModels, so editing one light's slider doesn't rebuild
   * every other light. */
  async sync(defs: ArtificialLight[]) {
    const wanted = new Map(defs.filter((d) => d.enabled).map((d) => [d.id, d]));
    for (const [id, entry] of this.entries) {
      if (!wanted.has(id)) {
        this.removeEntry(id, entry);
      }
    }
    for (const def of defs) {
      if (!def.enabled) continue;
      const existing = this.entries.get(def.id);
      if (existing && this.sameType(existing.light, def.type)) {
        await this.applyToLight(existing.light, def);
        this.updateHelper(def, existing);
        continue;
      }
      if (existing) this.removeEntry(def.id, existing);
      const light = await this.createLight(def);
      this.group.add(light);
      const entry: LightEntry = { light, helper: null };
      this.entries.set(def.id, entry);
      this.updateHelper(def, entry);
    }
  }

  private removeEntry(id: string, entry: LightEntry) {
    this.group.remove(entry.light);
    const targetHost = entry.light as THREE.SpotLight;
    if (targetHost.target && targetHost.target.parent === this.group) this.group.remove(targetHost.target);
    if (entry.helper) this.group.remove(entry.helper);
    this.entries.delete(id);
  }

  private sameType(light: THREE.Light, type: ArtificialLight["type"]): boolean {
    if (type === "ies") return light instanceof IESSpotLight;
    if (type === "spot") return light instanceof THREE.SpotLight && !(light instanceof IESSpotLight);
    if (type === "point") return light instanceof THREE.PointLight;
    if (type === "rect") return light instanceof THREE.RectAreaLight;
    return false;
  }

  private async createLight(def: ArtificialLight): Promise<THREE.Light> {
    let light: THREE.Light;
    if (def.type === "point") light = new THREE.PointLight();
    else if (def.type === "rect") {
      ensureRectAreaLightSupport();
      light = new THREE.RectAreaLight();
    } else if (def.type === "ies") light = new IESSpotLight();
    else light = new THREE.SpotLight();
    await this.applyToLight(light, def);
    return light;
  }

  private async applyToLight(light: THREE.Light, def: ArtificialLight) {
    light.name = def.name;
    light.position.set(def.position.x, def.position.y, def.position.z);
    light.color.set(def.colorHex);
    light.intensity = def.intensity;

    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
      light.distance = def.distance;
      light.decay = def.decay;
      light.castShadow = def.shadowsEnabled;
    }
    if (light instanceof THREE.SpotLight) {
      light.angle = (Math.max(0.1, Math.min(89, def.angleDeg)) * Math.PI) / 180;
      light.penumbra = def.penumbra;
      if (!light.target.parent) this.group.add(light.target);
      light.target.position.set(def.target.x, def.target.y, def.target.z);
    }
    if (light instanceof THREE.RectAreaLight) {
      light.width = Math.max(0.01, def.width);
      light.height = Math.max(0.01, def.height);
      light.lookAt(def.target.x, def.target.y, def.target.z);
    }
    if (light instanceof IESSpotLight) {
      light.iesMap = def.iesProfileUrl ? await this.loadIES(def.iesProfileUrl) : null;
    }
  }

  private loadIES(url: string): Promise<THREE.DataTexture | null> {
    if (!this.iesCache.has(url)) {
      const promise = new Promise<THREE.DataTexture | null>((resolve) => {
        this.iesLoader.load(
          url,
          (tex) => resolve(tex as THREE.DataTexture),
          undefined,
          (err) => {
            console.warn("ArtificialLightSystem: IES profile failed to load", url, err);
            resolve(null);
          }
        );
      });
      this.iesCache.set(url, promise);
    }
    return this.iesCache.get(url)!;
  }

  private updateHelper(def: ArtificialLight, entry: LightEntry) {
    if (entry.helper) {
      this.group.remove(entry.helper);
      entry.helper = null;
    }
    if (!def.helperEnabled) return;
    let helper: THREE.Object3D | null = null;
    if (entry.light instanceof THREE.RectAreaLight) helper = new RectAreaLightHelper(entry.light);
    else if (entry.light instanceof THREE.SpotLight) helper = new THREE.SpotLightHelper(entry.light);
    else if (entry.light instanceof THREE.PointLight) helper = new THREE.PointLightHelper(entry.light, 0.5);
    if (helper) {
      this.group.add(helper);
      entry.helper = helper;
    }
  }

  dispose() {
    for (const [id, entry] of this.entries) this.removeEntry(id, entry);
  }
}
