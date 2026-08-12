import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import mapboxgl from "mapbox-gl";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";

export interface MapModelEntry {
  projectId: string;
  glbUrl: string;
  lng: number;
  lat: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
}

interface LoadedModel {
  root: THREE.Group;
  entry: MapModelEntry;
  /** Real terrain height (meters, post-exaggeration) last baked into this
   * model's matrix — see `applyTransform`'s doc comment for why this is
   * tracked instead of always assuming ground = sea level. */
  lastGroundElevation: number;
}

/** Re-querying terrain elevation is cheap (an in-memory DEM lookup, not a
 * network call), but rebuilding a model's full transform matrix every frame
 * is needless work when nothing actually changed — skip it unless the
 * queried ground height moved by more than this. */
const ELEVATION_EPSILON_M = 0.05;

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
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0, -70, 100).normalize();
    this.scene.add(sun);
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
    if (existing && existing.entry.glbUrl === entry.glbUrl) {
      // Same file — just a placement (scale/rotation/altitude) change.
      existing.entry = entry;
      this.applyTransform(existing, this.queryGroundElevation(entry));
      return;
    }
    // New project, or Admin replaced the file — (re)load the geometry.
    if (existing) {
      this.scene.remove(existing.root);
      disposeObject3D(existing.root);
      this.loaded.delete(entry.projectId);
    }
    if (this.pendingUrls.get(entry.projectId) === entry.glbUrl) return;
    this.pendingUrls.set(entry.projectId, entry.glbUrl);

    this.loader.load(
      entry.glbUrl,
      (gltf) => {
        // The entry may have moved on (or been removed) while this request
        // was in flight — only commit if it's still current.
        if (this.pendingUrls.get(entry.projectId) !== entry.glbUrl) return;
        this.pendingUrls.delete(entry.projectId);
        const root = gltf.scene;
        // Manual matrix control (see applyTransform) — Three.js must not
        // recompute this from position/quaternion/scale on its own.
        root.matrixAutoUpdate = false;
        root.traverse((child) => {
          child.userData.projectId = entry.projectId;
        });
        this.scene.add(root);
        const loaded: LoadedModel = { root, entry, lastGroundElevation: 0 };
        this.loaded.set(entry.projectId, loaded);
        this.applyTransform(loaded, this.queryGroundElevation(entry));
        this.map?.triggerRepaint();
      },
      undefined,
      (error) => {
        this.pendingUrls.delete(entry.projectId);
        this.onLoadError?.(entry.projectId, error, entry.glbUrl);
      }
    );
  }

  /**
   * Real ground height (meters, mean-sea-level basis) at the model's
   * lng/lat, per the map's own 3D terrain — `null`/`undefined` (terrain
   * disabled, or the relevant DEM tile hasn't loaded yet) collapses to 0.
   * `exaggerated: true` (the default) matches whatever exaggeration curve
   * the style applies, so this returns the same height the surrounding
   * basemap (buildings, roads) is actually rendered at, not the raw
   * unexaggerated DEM value.
   */
  private queryGroundElevation(entry: MapModelEntry): number {
    return this.map?.queryTerrainElevation({ lng: entry.lng, lat: entry.lat }) ?? 0;
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

    const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const rotationY = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(entry.rotationDeg)
    );
    const rotationZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), 0);

    const altitude = groundElevation + entry.altitudeOffset;
    const m = new THREE.Matrix4()
      .makeTranslation(mercator.x, mercator.y, mercator.z + altitude * metersToMercator)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    root.matrix.copy(m);
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
      const ground = this.queryGroundElevation(loaded.entry);
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
