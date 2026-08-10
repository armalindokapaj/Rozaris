import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import mapboxgl from "mapbox-gl";

export interface MapModelEntry {
  projectId: string;
  lng: number;
  lat: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
}

interface LoadedModel {
  root: THREE.Group;
  entry: MapModelEntry;
}

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
  private loaded = new Map<string, LoadedModel>();
  private pendingLoads = new Set<string>();
  private map: mapboxgl.Map | null = null;
  private onPick: (projectId: string) => void;
  private getBlobUrl: (projectId: string) => Promise<string | null>;

  constructor(opts: {
    onPick: (projectId: string) => void;
    getBlobUrl: (projectId: string) => Promise<string | null>;
  }) {
    this.onPick = opts.onPick;
    this.getBlobUrl = opts.getBlobUrl;
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
    entries.forEach((entry) => this.upsertEntry(entry));
  }

  private upsertEntry(entry: MapModelEntry) {
    const existing = this.loaded.get(entry.projectId);
    if (existing) {
      existing.entry = entry;
      this.applyTransform(existing);
      return;
    }
    if (this.pendingLoads.has(entry.projectId)) return;
    this.pendingLoads.add(entry.projectId);

    this.getBlobUrl(entry.projectId).then((url) => {
      if (!url) {
        this.pendingLoads.delete(entry.projectId);
        return;
      }
      this.loader.load(
        url,
        (gltf) => {
          this.pendingLoads.delete(entry.projectId);
          const root = gltf.scene;
          root.traverse((child) => {
            child.userData.projectId = entry.projectId;
          });
          this.scene.add(root);
          const loaded: LoadedModel = { root, entry };
          this.loaded.set(entry.projectId, loaded);
          this.applyTransform(loaded);
          this.map?.triggerRepaint();
        },
        undefined,
        () => this.pendingLoads.delete(entry.projectId)
      );
    });
  }

  private applyTransform(loaded: LoadedModel) {
    const { root, entry } = loaded;
    const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: entry.lng, lat: entry.lat },
      0
    );
    const metersToMercator = mercator.meterInMercatorCoordinateUnits();
    root.position.set(
      mercator.x,
      mercator.y,
      mercator.z + entry.altitudeOffset * metersToMercator
    );
    const s = metersToMercator * entry.scale;
    root.scale.set(s, s, s);
    // GLB convention (Y-up) -> Mercator space (Z-up): tip the model onto its
    // Z axis, then apply Admin's heading offset around that new "up" axis.
    root.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(entry.rotationDeg));
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
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix as number[]);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map?.triggerRepaint();
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
