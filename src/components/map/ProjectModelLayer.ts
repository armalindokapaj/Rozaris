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
  glbUrl?: string;
  massing?: MassingBox[];
}

function geometrySignature(entry: MapModelEntry): string {
  return entry.glbUrl ?? JSON.stringify(entry.massing ?? []);
}

interface LoadedModel {
  root: THREE.Group;
  entry: MapModelEntry;
  signature: string;
  lastGroundElevation: number;
}

const MASSING_COLOR = 0xb9b2a6;
const MASSING_EDGE_COLOR = 0x6b6558;

const ELEVATION_EPSILON_M = 0.05;

const ROTATION_X = new THREE.Matrix4().makeRotationX(Math.PI / 2);

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
  private scratchRotationY = new THREE.Matrix4();
  private scratchScale = new THREE.Vector3();
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;
  private ambientBaseIntensity = 1.5;

  constructor(opts: {
    onPick: (projectId: string) => void;
    onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
  }) {
    this.onPick = opts.onPick;
    this.onLoadError = opts.onLoadError;
    this.dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    this.loader.setDRACOLoader(this.dracoLoader);
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.ambientBaseIntensity);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(0, -70, 100).normalize();
    this.scene.add(this.sunLight);
  }

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
      existing.entry = entry;
      this.applyTransform(existing, this.queryGroundElevation(entry, existing.lastGroundElevation));
      return;
    }
    if (existing) {
      this.scene.remove(existing.root);
      disposeObject3D(existing.root);
      this.loaded.delete(entry.projectId);
    }

    if (entry.massing) {
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
        if (this.pendingUrls.get(entry.projectId) !== glbUrl) return;
        this.pendingUrls.delete(entry.projectId);
        const root = gltf.scene;
        root.traverse((child) => {
          child.userData.projectId = entry.projectId;
          child.frustumCulled = false;

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
    root.matrixAutoUpdate = false;
    this.scene.add(root);
    const loaded: LoadedModel = { root, entry, signature, lastGroundElevation: 0 };
    this.loaded.set(entry.projectId, loaded);
    this.applyTransform(loaded, this.queryGroundElevation(entry, 0));
    this.map?.triggerRepaint();
  }

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

  private queryGroundElevation(entry: MapModelEntry, fallback: number): number {
    return this.map?.queryTerrainElevation({ lng: entry.lng, lat: entry.lat }) ?? fallback;
  }

  private applyTransform(loaded: LoadedModel, groundElevation: number) {
    const { root, entry } = loaded;
    loaded.lastGroundElevation = groundElevation;
    const mercator = mapboxgl.MercatorCoordinate.fromLngLat(
      { lng: entry.lng, lat: entry.lat },
      0
    );
    const metersToMercator = mercator.meterInMercatorCoordinateUnits();
    const s = metersToMercator * entry.scale;

    this.scratchRotationY.makeRotationY(THREE.MathUtils.degToRad(entry.rotationDeg));

    const altitude = groundElevation + entry.altitudeOffset;
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

    for (const loaded of this.loaded.values()) {
      const ground = this.queryGroundElevation(loaded.entry, loaded.lastGroundElevation);
      if (Math.abs(ground - loaded.lastGroundElevation) > ELEVATION_EPSILON_M) {
        this.applyTransform(loaded, ground);
      }
    }

    this.camera.projectionMatrix.fromArray(matrix as number[]);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
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
