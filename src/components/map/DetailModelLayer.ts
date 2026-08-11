import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import mapboxgl from "mapbox-gl";
import { DRACO_DECODER_PATH } from "@/lib/gltfDecoder";
import { UNIT_BOX_COLOR, UNIT_BOX_OPACITY, UNIT_BOX_SELECTED_OPACITY, SELECTED_COLOR, VIEW_PRESET_MATERIAL, type ViewPreset } from "@/lib/viewerPresets";
import type { Unit, UnitMeshLink } from "@/lib/types";

export interface DetailModelPlacement {
  glbUrl: string;
  lng: number;
  lat: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
}

interface UnitBoxEntry {
  node: THREE.Object3D;
  unitId: string;
}

/**
 * Single-project sibling of ProjectModelLayer.ts (the outdoor search-map
 * GLB layer) — same Mercator placement math and load/dispose lifecycle,
 * reused verbatim (see that file's doc comment for why the matrix is built
 * exactly this way). Renders the Project 3D Experience's detailed GLB at
 * the project's real coordinates, plus the admin-linked `Unit_<number>`
 * box nodes baked into that same file: hidden by default, shown (colored
 * by live status, ~80% transparent) only once both `setLinks` has a link
 * for that node AND `setShowUnitBoxes(true)` has been called — see
 * MapboxProjectViewer.tsx, which wires the "Unit Search" bottom-bar toggle
 * to the latter.
 */
export class DetailModelLayer implements mapboxgl.CustomLayerInterface {
  id = "project-detail-model";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private loader = new GLTFLoader();
  private dracoLoader = new DRACOLoader();
  private map: mapboxgl.Map | null = null;

  private root: THREE.Group | null = null;
  private loadedGlbUrl: string | null = null;
  private pendingGlbUrl: string | null = null;
  private placement: DetailModelPlacement | null = null;

  private unitBoxes = new Map<string, UnitBoxEntry>(); // meshName -> entry
  private links: UnitMeshLink[] = [];
  private units: Unit[] = [];
  private showUnitBoxes = false;
  private filterFn: (unit: Unit) => boolean = () => true;
  private selectedUnitId: string | null = null;
  private hoveredUnitId: string | null = null;
  private viewPreset: ViewPreset = "realistic";

  private onSelectUnit: (unitId: string) => void;
  private onHoverChange?: (unitId: string | null) => void;
  private onLoadError?: (error: unknown) => void;

  constructor(opts: {
    onSelectUnit: (unitId: string) => void;
    onHoverChange?: (unitId: string | null) => void;
    onLoadError?: (error: unknown) => void;
  }) {
    this.onSelectUnit = opts.onSelectUnit;
    this.onHoverChange = opts.onHoverChange;
    this.onLoadError = opts.onLoadError;
    this.dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    this.loader.setDRACOLoader(this.dracoLoader);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0, -70, 100).normalize();
    this.scene.add(sun);
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    map.getCanvas().addEventListener("click", this.handleClick);
    map.getCanvas().addEventListener("mousemove", this.handleMouseMove);
  }

  onRemove() {
    this.map?.getCanvas().removeEventListener("click", this.handleClick);
    this.map?.getCanvas().removeEventListener("mousemove", this.handleMouseMove);
    if (this.root) disposeObject3D(this.root);
    this.root = null;
    this.unitBoxes.clear();
    this.dracoLoader.dispose();
    this.renderer = null;
    this.map = null;
  }

  /** Loads (or repositions, if only placement changed) the detailed GLB. */
  setPlacement(placement: DetailModelPlacement | null) {
    if (!placement) {
      if (this.root) {
        this.scene.remove(this.root);
        disposeObject3D(this.root);
        this.root = null;
        this.loadedGlbUrl = null;
        this.unitBoxes.clear();
      }
      this.placement = null;
      return;
    }
    this.placement = placement;
    if (this.root && this.loadedGlbUrl === placement.glbUrl) {
      this.applyTransform();
      return;
    }
    if (this.pendingGlbUrl === placement.glbUrl) return;
    this.pendingGlbUrl = placement.glbUrl;
    this.loader.load(
      placement.glbUrl,
      (gltf) => {
        if (this.pendingGlbUrl !== placement.glbUrl) return;
        this.pendingGlbUrl = null;
        if (this.root) {
          this.scene.remove(this.root);
          disposeObject3D(this.root);
        }
        const root = gltf.scene;
        root.matrixAutoUpdate = false;
        this.root = root;
        this.loadedGlbUrl = placement.glbUrl;
        this.scene.add(root);
        this.rebuildUnitBoxes();
        this.applyTransform();
        this.applyMaterialPreset();
        this.map?.triggerRepaint();
      },
      undefined,
      (error) => {
        this.pendingGlbUrl = null;
        this.onLoadError?.(error);
      }
    );
  }

  /** Admin's confirmed Unit_<number> -> Unit mapping, plus the current
   * Units themselves (for live status/color). Re-tags/recolors existing
   * loaded nodes without reloading the GLB. */
  setLinks(links: UnitMeshLink[], units: Unit[]) {
    this.links = links;
    this.units = units;
    this.rebuildUnitBoxes();
    this.refreshUnitBoxAppearance();
    this.map?.triggerRepaint();
  }

  setShowUnitBoxes(show: boolean) {
    this.showUnitBoxes = show;
    this.refreshUnitBoxAppearance();
    this.map?.triggerRepaint();
  }

  setFilter(filterFn: (unit: Unit) => boolean) {
    this.filterFn = filterFn;
    this.refreshUnitBoxAppearance();
    this.map?.triggerRepaint();
  }

  setSelectedUnitId(unitId: string | null) {
    this.selectedUnitId = unitId;
    this.refreshUnitBoxAppearance();
    this.map?.triggerRepaint();
  }

  setMaterialPreset(preset: ViewPreset) {
    this.viewPreset = preset;
    this.applyMaterialPreset();
    this.map?.triggerRepaint();
  }

  /** Finds every child node whose name matches a saved link, tags it with
   * the resolved unitId, and forces it invisible by default — called after
   * (re)load and whenever links change, since node identities are stable
   * across a links-only update. */
  private rebuildUnitBoxes() {
    this.unitBoxes.clear();
    if (!this.root) return;
    const linkByName = new Map(this.links.map((l) => [l.meshName, l.unitId]));
    this.root.traverse((child) => {
      const unitId = linkByName.get(child.name);
      if (!unitId) {
        if (/^Unit_/i.test(child.name)) child.visible = false; // unlinked node — never shown
        return;
      }
      child.visible = false;
      child.userData.unitId = unitId;
      this.unitBoxes.set(child.name, { node: child, unitId });
    });
  }

  private refreshUnitBoxAppearance() {
    this.unitBoxes.forEach(({ node, unitId }) => {
      const unit = this.units.find((u) => u.id === unitId);
      if (!unit) {
        node.visible = false;
        return;
      }
      const isSelected = unitId === this.selectedUnitId;
      const isHovered = unitId === this.hoveredUnitId;
      const visible = this.showUnitBoxes && this.filterFn(unit);
      node.visible = visible;
      const color = isSelected ? SELECTED_COLOR : UNIT_BOX_COLOR[unit.status];
      const opacity = isSelected || isHovered ? UNIT_BOX_SELECTED_OPACITY : UNIT_BOX_OPACITY;
      applyBoxMaterial(node, color, opacity);
    });
  }

  /** Applies the shared VIEW_PRESET_MATERIAL treatment to every mesh in the
   * loaded GLB EXCEPT the tagged unit boxes (those keep their own status
   * color/opacity, recomputed by refreshUnitBoxAppearance). */
  private applyMaterialPreset() {
    if (!this.root) return;
    const preset = VIEW_PRESET_MATERIAL[this.viewPreset];
    const unitBoxNodes = new Set(Array.from(this.unitBoxes.values()).map((e) => e.node));
    this.root.traverse((child) => {
      if (unitBoxNodes.has(child)) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((mat) => {
        const std = mat as THREE.MeshStandardMaterial;
        if (preset.color != null) std.color?.setHex(preset.color);
        if (typeof std.roughness === "number") std.roughness = preset.roughness;
        if (typeof std.metalness === "number") std.metalness = preset.metalness;
      });
    });
  }

  private applyTransform() {
    if (!this.root || !this.placement) return;
    const { lng, lat, scale, rotationDeg, altitudeOffset } = this.placement;
    const mercator = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, 0);
    const metersToMercator = mercator.meterInMercatorCoordinateUnits();
    const s = metersToMercator * scale;

    const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const rotationY = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(rotationDeg)
    );

    const m = new THREE.Matrix4()
      .makeTranslation(mercator.x, mercator.y, mercator.z + altitudeOffset * metersToMercator)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(rotationX)
      .multiply(rotationY);

    this.root.matrix.copy(m);
  }

  private raycastUnitBox(e: MouseEvent): string | null {
    if (!this.map || this.unitBoxes.size === 0) return null;
    const rect = this.map.getCanvas().getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const invProjection = new THREE.Matrix4().copy(this.camera.projectionMatrix).invert();
    const near = new THREE.Vector3(ndcX, ndcY, 0).applyMatrix4(invProjection);
    const far = new THREE.Vector3(ndcX, ndcY, 1).applyMatrix4(invProjection);
    const direction = far.clone().sub(near).normalize();

    const raycaster = new THREE.Raycaster(near, direction);
    const visibleNodes = Array.from(this.unitBoxes.values())
      .filter((e) => e.node.visible)
      .map((e) => e.node);
    const hits = raycaster.intersectObjects(visibleNodes, true);
    if (hits.length === 0) return null;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.unitId) obj = obj.parent;
    return (obj?.userData.unitId as string | undefined) ?? null;
  }

  private handleClick = (e: MouseEvent) => {
    const unitId = this.raycastUnitBox(e);
    if (unitId) {
      e.stopPropagation();
      this.onSelectUnit(unitId);
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    const unitId = this.raycastUnitBox(e);
    if (unitId !== this.hoveredUnitId) {
      this.hoveredUnitId = unitId;
      this.refreshUnitBoxAppearance();
      this.map?.triggerRepaint();
      this.onHoverChange?.(unitId);
      if (this.map) this.map.getCanvas().style.cursor = unitId ? "pointer" : "";
    }
  };

  render(_gl: WebGLRenderingContext, matrix: number[] | Float32Array) {
    if (!this.renderer) return;
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix as number[]);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    // Same reasoning as ProjectModelLayer.render() — no triggerRepaint()
    // here, only after async load / state changes above.
  }
}

/** Overrides every mesh under `node` (itself, or its mesh descendants if
 * it's a Group) with a translucent, non-depth-writing MeshBasicMaterial —
 * the "80% transparent colored box" look, applied fresh each call rather
 * than mutating a shared material instance. */
function applyBoxMaterial(node: THREE.Object3D, color: number, opacity: number) {
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const prev = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
    else prev?.dispose();
    mesh.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
  });
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
