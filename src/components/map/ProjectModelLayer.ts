import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import mapboxgl from "mapbox-gl";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import type { MassingBox } from "@/lib/threeBuilding";

export interface MapModelEntry {
  projectId: string;
  lng: number;
  lat: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  /** A real admin-uploaded GLB (Blob URL) — mutually exclusive with
   * `massing` below; when present, this always wins. */
  glbUrl?: string;
  /** Data-driven procedural building volumes (see
   * `threeBuilding.ts`'s `computeProjectMassing`) — the map's default 3D
   * hero for a project with no `glbUrl` yet (T1 of the platform audit's
   * roadmap; see the "Rozaris Platform Audit" memory). Real meters,
   * Y-up — built directly with `THREE.BoxGeometry`, no network load. */
  massing?: MassingBox[];
}

/** Cheap stable identity for an entry's geometry — whichever of `glbUrl`/
 * `massing` is present — so `upsertEntry` can tell "just a placement
 * change" (reapply the transform only) from "the geometry itself changed"
 * (reload/rebuild) without caring which kind of entry it is. */
function geometrySignature(entry: MapModelEntry): string {
  return entry.glbUrl ?? JSON.stringify(entry.massing ?? []);
}

interface LoadedModel {
  root: THREE.Group;
  entry: MapModelEntry;
  signature: string;
  /** Real terrain height (meters, post-exaggeration) last baked into this
   * model's matrix — see `applyTransform`'s doc comment for why this is
   * tracked instead of always assuming ground = sea level. */
  lastGroundElevation: number;
}

/** Warm architectural gray — a deliberately neutral placeholder so a
 * procedural massing box reads as "real building, no photo yet" rather
 * than competing with an actual admin-uploaded model's own materials. */
const MASSING_COLOR = 0xb9b2a6;
const MASSING_EDGE_COLOR = 0x6b6558;

/** Re-querying terrain elevation is cheap (an in-memory DEM lookup, not a
 * network call), but rebuilding a model's full transform matrix every frame
 * is needless work when nothing actually changed — skip it unless the
 * queried ground height moved by more than this. */
const ELEVATION_EPSILON_M = 0.05;

/** The X tip-onto-its-side rotation (see `applyTransform`'s doc comment) is
 * always the same fixed 90°, unlike Y (heading) which varies per entry —
 * computed once at module load and reused (read-only, never mutated) rather
 * than reallocated on every `applyTransform` call. That call runs from
 * `render()`'s per-frame terrain self-heal check, so it can fire
 * continuously while the camera is panning across varying elevation —
 * shaving allocations off it measurably cuts GC pressure during exactly the
 * "moving the map" window admins/visitors reported as laggish. */
const ROTATION_X = new THREE.Matrix4().makeRotationX(Math.PI / 2);

/**
 * mapbox-gl custom layer that renders each project's uploaded GLB as a real
 * georeferenced 3D object at its lng/lat, sharing the map's own WebGL
 * context/camera matrix with a Three.js scene — the standard technique for
 * "put a real 3D model on a Mapbox map" (see Mapbox's "Add a 3D model"
 * example). Positions are computed directly in Mercator space (meters via
 * `MercatorCoordinate.meterInMercatorCoordinateUnits()`) rather than via a
 * separate world matrix, so the render-loop camera can stay a plain
 * `THREE.Camera` fed mapbox's projection matrix every frame.
 *
 * Click-to-open is a manual raycast (`THREE.Raycaster.setFromCamera` only
 * supports Perspective/Orthographic cameras, which this camera is neither)
 * — a ray is built by unprojecting the clicked point through the inverse of
 * that same projection matrix, which works because the camera's view matrix
 * is always identity here (model positions are already in the camera's
 * "world" == Mercator space, never relative to a moving camera transform).
 */
export class ProjectModelLayer implements mapboxgl.CustomLayerInterface {
  id = "project-3d-models";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private loader = new GLTFLoader();
  private dracoLoader = new DRACOLoader();
  private loaded = new Map<string, LoadedModel>();
  private pendingUrls = new Map<string, string>();
  private map: mapboxgl.Map | null = null;
  private onPick: (projectId: string) => void;
  private onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
  // Reused across every applyTransform() call instead of allocating fresh
  // Matrix4/Vector3 instances each time — see ROTATION_X's comment above.
  private scratchRotationY = new THREE.Matrix4();
  private scratchScale = new THREE.Vector3();
  // Promoted from constructor-local consts (their original, still-default
  // values below) so setSun() can update them later — see its own doc
  // comment for the "Map" tab this now serves.
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;
  private ambientBaseIntensity = 1.5;

  constructor(opts: {
    onPick: (projectId: string) => void;
    onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
  }) {
    this.onPick = opts.onPick;
    this.onLoadError = opts.onLoadError;
    // Admin-uploaded GLBs commonly come out of Blender/other export
    // pipelines with Draco mesh compression on by default — without a
    // decoder wired in, GLTFLoader throws on those (hard load failure, not
    // a cosmetic issue), so this is set up unconditionally rather than only
    // once a specific file is known to need it. Google's hosted decoder is
    // the path used by Three.js's own examples/docs — no local decoder
    // files to vendor into `public/`.
    this.dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    this.loader.setDRACOLoader(this.dracoLoader);
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.ambientBaseIntensity);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(0, -70, 100).normalize();
    this.scene.add(this.sunLight);
  }

  /**
   * Re-lights the layer's own sun/ambient pair to match a project's
   * configured lighting (Experience Editor "Map" tab — see
   * Project3DConfig's own doc comment) instead of the fixed default set in
   * the constructor above. Callers pass `direction` in the SAME Y-up
   * (X=east, Y=up, Z=south) convention `src/lib/sunPosition.ts`'s
   * `sunDirectionVector()` already returns — this method itself owns the
   * Y-up→this-layer's-own-frame conversion, the same responsibility
   * `applyTransform()` above already has for model geometry. Unlike
   * `applyTransform`'s Mercator translation (`.x`/`.y` horizontal, `.z`
   * altitude — see `MercatorCoordinate`), a `DirectionalLight.position` is
   * only ever a direction (never translated), so no ROTATION_X/handedness
   * correction is needed here — just the matching axis permutation
   * (Y-up's vertical Y → this scene's vertical Z; Y-up's south Z → this
   * scene's south Y): `(x, y, z) → (x, z, y)`.
   *
   * `enabled: false` (Project3DConfig's `sunLightEnabled`) floors both
   * lights' intensity at 0 rather than removing them from the scene —
   * cheaper than add/remove churn and avoids ever leaving the layer with no
   * light source, which would read as "broken" rather than "sun off"
   * (ambient still gives a faint, real-looking fill either way).
   */
  setSun(opts: {
    direction: { x: number; y: number; z: number };
    color: number;
    intensity: number;
    ambientIntensity?: number;
    enabled: boolean;
  }) {
    const { direction, color, intensity, ambientIntensity, enabled } = opts;
    this.sunLight.position.set(direction.x, direction.z, direction.y).normalize();
    this.sunLight.color.setHex(color);
    this.sunLight.intensity = enabled ? intensity : 0;
    this.ambientLight.color.setHex(color);
    this.ambientLight.intensity = enabled ? (ambientIntensity ?? this.ambientBaseIntensity) : this.ambientBaseIntensity * 0.4;
    this.map?.triggerRepaint();
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    map.getCanvas().addEventListener("click", this.handleClick);
  }

  onRemove() {
    this.map?.getCanvas().removeEventListener("click", this.handleClick);
    this.loaded.forEach((m) => disposeObject3D(m.root));
    this.loaded.clear();
    this.pendingUrls.clear();
    this.dracoLoader.dispose();
    this.renderer = null;
    this.map = null;
  }

  /** Reconcile against the current admin-configured entries (called whenever
   * the visible project list or their map-model config changes). */
  setEntries(entries: MapModelEntry[]) {
    const nextIds = new Set(entries.map((e) => e.projectId));
    for (const [id, loaded] of this.loaded) {
      if (!nextIds.has(id)) {
        this.scene.remove(loaded.root);
        disposeObject3D(loaded.root);
        this.loaded.delete(id);
      }
    }
    for (const id of this.pendingUrls.keys()) {
      if (!nextIds.has(id)) this.pendingUrls.delete(id);
    }
    entries.forEach((entry) => this.upsertEntry(entry));
  }

  private upsertEntry(entry: MapModelEntry) {
    const existing = this.loaded.get(entry.projectId);
    const signature = geometrySignature(entry);
    if (existing && existing.signature === signature) {
      // Same geometry (same GLB file, or the same computed massing) — just
      // a placement (scale/rotation/altitude) change.
      existing.entry = entry;
      this.applyTransform(existing, this.queryGroundElevation(entry, existing.lastGroundElevation));
      return;
    }
    // New project, the geometry itself changed (Admin replaced the GLB, or
    // the project's own unit data changed its computed massing) — (re)build.
    if (existing) {
      this.scene.remove(existing.root);
      disposeObject3D(existing.root);
      this.loaded.delete(entry.projectId);
    }

    if (entry.massing) {
      // Synchronous, no network round trip — commits immediately.
      this.pendingUrls.delete(entry.projectId);
      const root = this.buildMassingGroup(entry.projectId, entry.massing);
      this.commitLoaded(entry, root, signature);
      return;
    }
    if (!entry.glbUrl) return;

    if (this.pendingUrls.get(entry.projectId) === entry.glbUrl) return;
    this.pendingUrls.set(entry.projectId, entry.glbUrl);
    const glbUrl = entry.glbUrl;

    this.loader.load(
      glbUrl,
      (gltf) => {
        // The entry may have moved on (or been removed) while this request
        // was in flight — only commit if it's still current.
        if (this.pendingUrls.get(entry.projectId) !== glbUrl) return;
        this.pendingUrls.delete(entry.projectId);
        const root = gltf.scene;
        root.traverse((child) => {
          child.userData.projectId = entry.projectId;
          // Three.js's automatic per-mesh frustum culling derives its
          // clip planes from `camera.projectionMatrix` — here that's
          // Mapbox's own mercator/pitch projection matrix (see render()
          // below), not a standard OpenGL projection. Testing each mesh's
          // bounding sphere against those incorrectly-derived planes
          // silently drops meshes that are actually on-screen, and which
          // ones get dropped shifts with bearing/pitch — this is exactly
          // the "faces disappear when rotating and don't come back"
          // symptom. Mapbox's own viewport clipping already keeps the
          // layer from drawing off-screen, so per-mesh culling here is
          // both redundant and actively wrong — disable it.
          child.frustumCulled = false;

          // Force every material double-sided — this is what actually
          // explains "doesn't load all faces" / "removes a lot of faces"
          // for a single-mesh file like this one: per-object frustum
          // culling (above) only ever drops a whole mesh at once, but this
          // symptom is *partial*, sub-mesh face loss, which is what
          // GPU backface culling does when a triangle's winding comes out
          // reversed. Two independent sources of reversed winding stack
          // here: (1) whatever inconsistency already exists in the
          // uploaded file itself — Admin-sourced GLBs are arbitrary,
          // frequently-mirrored assets (duplicated/mirrored parts are a
          // very common export pattern) with no guarantee every triangle
          // was wound the same way to begin with, and (2) the Y-up→Z-up
          // conversion `applyTransform` performs via a negative Y scale
          // (unavoidable — see its doc comment) flips every triangle's
          // apparent winding uniformly, which only makes an
          // already-inconsistent file's culling behavior worse. The
          // Project 3D Experience viewer (RenderEngine.ts) never needs
          // this because it renders in a plain Three.js Y-up scene with no
          // such flip — this mapbox integration is the one place that
          // risk actually exists, so it's the one place a blanket
          // `DoubleSide` earns its (here negligible — this file is one
          // ~1,700-triangle mesh) extra fragment cost.
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat) => {
              mat.side = THREE.DoubleSide;
            });
          }
        });
        this.commitLoaded(entry, root, signature);
      },
      undefined,
      (error) => {
        this.pendingUrls.delete(entry.projectId);
        this.onLoadError?.(entry.projectId, error, glbUrl);
      }
    );
  }

  private commitLoaded(entry: MapModelEntry, root: THREE.Group, signature: string) {
    // Manual matrix control (see applyTransform) — Three.js must not
    // recompute this from position/quaternion/scale on its own.
    root.matrixAutoUpdate = false;
    this.scene.add(root);
    const loaded: LoadedModel = { root, entry, signature, lastGroundElevation: 0 };
    this.loaded.set(entry.projectId, loaded);
    this.applyTransform(loaded, this.queryGroundElevation(entry, 0));
    this.map?.triggerRepaint();
  }

  /**
   * The map's default 3D hero for a project with no admin-uploaded GLB —
   * one extruded box per building, sized in real meters from
   * `threeBuilding.ts`'s `computeProjectMassing` (real unit/floor data, not
   * a fixed placeholder size). Built Y-up, same convention a GLTF export
   * uses, so it flows through `applyTransform`'s existing Y-up→Mercator
   * conversion — including its winding flip — unchanged; `DoubleSide`
   * below is what keeps every face visible after that flip, same reason
   * the GLB path forces it above.
   */
  private buildMassingGroup(projectId: string, boxes: MassingBox[]): THREE.Group {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: MASSING_COLOR,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    for (const box of boxes) {
      const geometry = new THREE.BoxGeometry(box.widthM, box.heightM, box.depthM);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(box.offsetXM, box.heightM / 2, box.offsetZM);
      mesh.frustumCulled = false;
      mesh.userData.projectId = projectId;
      root.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: MASSING_EDGE_COLOR })
      );
      edges.position.copy(mesh.position);
      edges.frustumCulled = false;
      root.add(edges);
    }
    return root;
  }

  /**
   * Real ground height (meters, mean-sea-level basis) at the model's
   * lng/lat, per the map's own 3D terrain. `exaggerated: true` (the
   * default) matches whatever exaggeration curve the style applies, so
   * this returns the same height the surrounding basemap (buildings,
   * roads) is actually rendered at, not the raw unexaggerated DEM value —
   * this style's imported "Mapbox Standard" fragment defines one that
   * ramps 0→1 between zoom 6–7, holds 1 through zoom 12, then ramps back
   * down to 0 by zoom 13.7 (Standard deliberately flattens terrain once
   * you're zoomed in close), so this legitimately returns a different
   * number as the camera zooms through that range, not just when lng/lat
   * changes.
   *
   * `queryTerrainElevation` itself returns `null` whenever the DEM tile
   * covering this point isn't currently loaded/rendered — routine while
   * the camera is actively panning to a new area, since the query is a
   * synchronous point-sample against whatever's already resident, not a
   * fetch. Collapsing that to a hardcoded 0 (sea level) used to be exactly
   * "doesn't stick to the ground when the camera moves": every brief gap
   * in DEM coverage snapped the model down to sea-level altitude and back
   * up once the real tile arrived, a real pop on every pan/zoom rather
   * than a one-time settle. Falling back to the model's own last-known
   * height instead means a momentary miss just holds the model where it
   * already correctly was until a real sample supersedes it.
   */
  private queryGroundElevation(entry: MapModelEntry, fallback: number): number {
    return this.map?.queryTerrainElevation({ lng: entry.lng, lat: entry.lat }) ?? fallback;
  }

  /**
   * Positions/scales/rotates the model to sit at its real-world lng/lat —
   * built as one explicit matrix (translate * scale * rotateX * rotateY *
   * rotateZ), the exact composition Mapbox's own "Add a 3D model" example
   * uses, rather than Three.js's automatic Object3D position/rotation/scale
   * (which always composes as translate * rotate * scale). That distinction
   * only matters once the scale is non-uniform — which it is here: the Y
   * component is deliberately negative (see below) — so the two approaches
   * would otherwise produce visibly different, wrong results.
   *
   * Three corrections a naive port of the position/rotation/scale is easy to
   * miss, all confirmed as bugs in an earlier version of this file:
   *  1. Heading (Admin's rotationDeg) must be the middle (Y) rotation in the
   *     X→Y→Z chain, not the last (Z) one — since these multiply in that
   *     order, only Y lands as "spin around the model's own still-upright
   *     vertical axis, before it gets tipped onto its side by X". Putting it
   *     in Z instead spins around the model's original forward/depth axis
   *     (a roll, not a heading), which only matches "no rotation" by
   *     accident when rotationDeg happens to be 0.
   *  2. The Y scale must be negative. Converting a Y-up glTF into Mercator's
   *     Z-up space via the X rotation flips handedness; without correcting
   *     it, every face's winding is reversed and the model can render
   *     back-face-culled — i.e. it "loads" (no error, geometry is present)
   *     but appears broken/invisible/inside-out from the normal viewing
   *     angle. This is the single most common gotcha in this integration
   *     pattern.
   *  3. The altitude baked into the translation must include the real
   *     terrain height at this lng/lat (`groundElevation`), not just
   *     Admin's manual `altitudeOffset` fine-tune on top of sea level. This
   *     style has 3D terrain enabled (`terrain` in the published style
   *     JSON, exaggeration ramping to 1x by zoom 12) — every basemap
   *     building/road already renders elevated to match it. A model placed
   *     at raw sea-level altitude instead floats above or sinks into the
   *     ground by however many meters of real elevation exist there. Nearly
   *     invisible looking straight down, but glaringly obvious once you
   *     pitch/rotate the camera — this was the root cause of "the model
   *     doesn't stick when rotating or moving the map": the model was never
   *     misaligned relative to lng/lat, only relative to height.
   */
  private applyTransform(loaded: LoadedModel, groundElevation: number) {
    const { root, entry } = loaded;
    loaded.lastGroundElevation = groundElevation;
    const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: entry.lng, lat: entry.lat },
      0
    );
    const metersToMercator = mercator.meterInMercatorCoordinateUnits();
    const s = metersToMercator * entry.scale;

    // Heading is the only rotation that varies per entry — X is a shared
    // constant (ROTATION_X above) and the old Z term was always a fixed 0°
    // (an identity matrix multiplied in on every call for no effect), so
    // it's dropped rather than recomputed.
    this.scratchRotationY.makeRotationY(THREE.MathUtils.degToRad(entry.rotationDeg));

    const altitude = groundElevation + entry.altitudeOffset;
    // Written straight into root.matrix (matrixAutoUpdate is false, so
    // nothing else touches it) instead of building a separate Matrix4 and
    // copying it over — one fewer allocation on a call that can run every
    // frame while the camera is moving (see ROTATION_X's comment).
    root.matrix
      .makeTranslation(mercator.x, mercator.y, mercator.z + altitude * metersToMercator)
      .scale(this.scratchScale.set(s, -s, s))
      .multiply(ROTATION_X)
      .multiply(this.scratchRotationY);
  }

  private handleClick = (e: MouseEvent) => {
    if (!this.map || this.loaded.size === 0) return;
    const rect = this.map.getCanvas().getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Unproject through the inverse projection matrix (view matrix is
    // identity for this camera — see class doc comment above).
    const invProjection = new THREE.Matrix4().copy(this.camera.projectionMatrix).invert();
    const near = new THREE.Vector3(ndcX, ndcY, 0).applyMatrix4(invProjection);
    const far = new THREE.Vector3(ndcX, ndcY, 1).applyMatrix4(invProjection);
    const direction = far.clone().sub(near).normalize();

    const raycaster = new THREE.Raycaster(near, direction);
    const hits = raycaster.intersectObjects(
      Array.from(this.loaded.values()).map((l) => l.root),
      true
    );
    if (hits.length === 0) return;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.projectId) obj = obj.parent;
    if (obj?.userData.projectId) {
      e.stopPropagation();
      this.onPick(obj.userData.projectId as string);
    }
  };

  render(_gl: WebGLRenderingContext, matrix: number[] | Float32Array) {
    if (!this.renderer) return;

    // Self-heals stale/placeholder ground elevation (DEM tile not loaded
    // yet when the model was placed, or terrain data changing as the admin
    // pans to a new area) without paying for a full matrix rebuild on every
    // frame — `queryTerrainElevation` is a cheap in-memory lookup (no
    // network, no allocation), so checking it every render() call is fine;
    // only rebuilding the model's matrix when it actually moved is what
    // keeps this from adding needless per-frame cost.
    for (const loaded of this.loaded.values()) {
      const ground = this.queryGroundElevation(loaded.entry, loaded.lastGroundElevation);
      if (Math.abs(ground - loaded.lastGroundElevation) > ELEVATION_EPSILON_M) {
        this.applyTransform(loaded, ground);
      }
    }

    // Mutates the existing Matrix4 instead of allocating a new one every
    // frame — this runs continuously while the camera is being dragged/
    // rotated, so avoiding needless per-frame garbage matters here.
    this.camera.projectionMatrix.fromArray(matrix as number[]);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    // NOT map.triggerRepaint() here — that was the "laggish" bug: calling it
    // from inside render() re-schedules another render on every single
    // frame forever (render → triggerRepaint → next render → ...), pinning
    // the map to a continuous max-rate repaint loop even while the camera
    // is completely idle and nothing changed. Mapbox already calls render()
    // whenever a repaint is actually needed (camera move, style change); a
    // forced repaint is only needed once, right after a model finishes
    // loading asynchronously while the camera hasn't moved — that one-off
    // call already happens in upsertEntry() below.
  }
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => mat.dispose());
    }
  });
}
