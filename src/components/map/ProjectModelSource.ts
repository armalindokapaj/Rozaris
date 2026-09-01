import mapboxgl from "mapbox-gl";
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
  pickMassing?: MassingBox[];
}

export class ProjectModelSource {
  private map: mapboxgl.Map;
  private onPick: (projectId: string) => void;
  private onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
  private pickFallbackPx: number;

  private entries: MapModelEntry[] = [];
  private placed = new Map<string, PlacedModel>();
  private styleReady = false;
  private destroyed = false;

  constructor(
    map: mapboxgl.Map,
    opts: {
      onPick: (projectId: string) => void;
      onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
      pickFallbackPx?: number;
    }
  ) {
    this.map = map;
    this.onPick = opts.onPick;
    this.onLoadError = opts.onLoadError;
    this.pickFallbackPx = opts.pickFallbackPx ?? PICK_FALLBACK_PX;

    map.getCanvas().addEventListener("click", this.handleClick);
    map.on("error", this.handleError);
    map.on("style.load", this.handleStyleLoad);

    if (map.isStyleLoaded()) {
      this.styleReady = true;
      this.ensureMassingLayers();
    } else {
      map.once("style.load", () => {
      });
    }
  }

  setEntries(entries: MapModelEntry[]) {
    this.entries = entries;
    if (this.destroyed || !this.styleReady) return;
    this.sync();
  }

  destroy() {
    this.destroyed = true;
    this.map.getCanvas().removeEventListener("click", this.handleClick);
    this.map.off("error", this.handleError);
    this.map.off("style.load", this.handleStyleLoad);
    for (const projectId of Array.from(this.placed.keys())) {
      this.teardownModel(projectId);
    }
    safely(() => {
      if (this.map.getLayer(MASSING_FILL)) this.map.removeLayer(MASSING_FILL);
      if (this.map.getSource(MASSING_SRC)) this.map.removeSource(MASSING_SRC);
      if (this.map.getLayer(PICK_FILL)) this.map.removeLayer(PICK_FILL);
      if (this.map.getSource(PICK_SRC)) this.map.removeSource(PICK_SRC);
    });
  }

  private handleStyleLoad = () => {
    if (this.destroyed) return;
    this.styleReady = true;
    this.placed.clear();
    this.ensureMassingLayers();
    this.sync();
  };

  private sync() {
    const glbEntries = this.entries.filter(
      (e): e is MapModelEntry & { glbUrl: string } => !!e.glbUrl
    );
    const massingEntries = this.entries.filter((e) => !e.glbUrl && e.massing?.length);
    this.syncModels(glbEntries);
    this.syncMassing(massingEntries);
    this.syncPickTargets(glbEntries.filter((e) => e.pickMassing?.length));
  }

  private syncModels(entries: (MapModelEntry & { glbUrl: string })[]) {
    const next = new Map(entries.map((e) => [e.projectId, e]));

    for (const [projectId, placed] of Array.from(this.placed.entries())) {
      const entry = next.get(projectId);
      if (!entry || entry.glbUrl !== placed.url) this.teardownModel(projectId);
    }

    for (const entry of entries) {
      const placed = this.placed.get(entry.projectId);
      if (placed) this.updatePlacement(placed, entry);
      else this.buildModel(entry);
    }
  }

  private buildModel(entry: MapModelEntry & { glbUrl: string }) {
    const { modelId, sourceId, layerId } = idsFor(entry.projectId, entry.glbUrl);
    const map = this.map;

    const ok = safely(() => {
      if (!map.hasModel(modelId)) map.addModel(modelId, entry.glbUrl);
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: "geojson", data: pointFC(entry) });
      }
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "model",
          source: sourceId,
          slot: MODEL_SLOT,
          layout: { "model-id": modelId },
          paint: { ...STATIC_MODEL_PAINT, ...placementPaint(entry) },
        } as mapboxgl.ModelLayerSpecification);
      }
    });
    if (!ok) return;

    this.placed.set(entry.projectId, {
      url: entry.glbUrl,
      modelId,
      sourceId,
      layerId,
      lng: entry.lng,
      lat: entry.lat,
      scale: entry.scale,
      rotationDeg: entry.rotationDeg,
      altitudeOffset: entry.altitudeOffset,
    });
  }

  private updatePlacement(placed: PlacedModel, entry: MapModelEntry) {
    const map = this.map;
    if (placed.lng !== entry.lng || placed.lat !== entry.lat) {
      const source = map.getSource(placed.sourceId) as mapboxgl.GeoJSONSource | undefined;
      safely(() => source?.setData(pointFC(entry)));
      placed.lng = entry.lng;
      placed.lat = entry.lat;
    }
    if (
      placed.scale !== entry.scale ||
      placed.rotationDeg !== entry.rotationDeg ||
      placed.altitudeOffset !== entry.altitudeOffset
    ) {
      safely(() => {
        for (const [key, value] of Object.entries(placementPaint(entry))) {
          map.setPaintProperty(placed.layerId, key as never, value as never);
        }
      });
      placed.scale = entry.scale;
      placed.rotationDeg = entry.rotationDeg;
      placed.altitudeOffset = entry.altitudeOffset;
    }
  }

  private teardownModel(projectId: string) {
    const placed = this.placed.get(projectId);
    if (!placed) return;
    this.placed.delete(projectId);
    safely(() => {
      if (this.map.getLayer(placed.layerId)) this.map.removeLayer(placed.layerId);
      if (this.map.getSource(placed.sourceId)) this.map.removeSource(placed.sourceId);
      if (this.map.hasModel(placed.modelId)) this.map.removeModel(placed.modelId);
    });
  }

  private ensureMassingLayers() {
    const map = this.map;
    safely(() => {
      if (!map.getSource(MASSING_SRC)) {
        map.addSource(MASSING_SRC, { type: "geojson", data: EMPTY_FC });
      }
      if (!map.getLayer(MASSING_FILL)) {
        map.addLayer({
          id: MASSING_FILL,
          type: "fill-extrusion",
          source: MASSING_SRC,
          slot: MODEL_SLOT,
          paint: {
            "fill-extrusion-color": MASSING_COLOR,
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.95,
            "fill-extrusion-vertical-gradient": true,
          },
        });
      }
      if (!map.getSource(PICK_SRC)) {
        map.addSource(PICK_SRC, { type: "geojson", data: EMPTY_FC });
      }
      if (!map.getLayer(PICK_FILL)) {
        map.addLayer({
          id: PICK_FILL,
          type: "fill-extrusion",
          source: PICK_SRC,
          slot: MODEL_SLOT,
          paint: {
            "fill-extrusion-color": MASSING_COLOR,
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0,
          },
        });
      }
    });
  }

  private syncMassing(entries: MapModelEntry[]) {
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
    for (const entry of entries) {
      for (const box of entry.massing ?? []) features.push(massingFeature(entry, box));
    }
    const source = this.map.getSource(MASSING_SRC) as mapboxgl.GeoJSONSource | undefined;
    safely(() => source?.setData({ type: "FeatureCollection", features }));
  }

  private syncPickTargets(entries: MapModelEntry[]) {
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
    for (const entry of entries) {
      for (const box of entry.pickMassing ?? []) features.push(massingFeature(entry, box));
    }
    const source = this.map.getSource(PICK_SRC) as mapboxgl.GeoJSONSource | undefined;
    safely(() => source?.setData({ type: "FeatureCollection", features }));
  }

  private handleClick = (e: MouseEvent) => {
    if (this.destroyed || this.entries.length === 0) return;
    const map = this.map;
    const rect = map.getCanvas().getBoundingClientRect();
    const point: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];

    const layers = [
      ...Array.from(this.placed.values()).map((p) => p.layerId),
      MASSING_FILL,
      PICK_FILL,
    ].filter((id) => !!map.getLayer(id));

    let projectId: string | null = null;
    if (layers.length > 0) {
      const hit = safelyValue(() => map.queryRenderedFeatures(point, { layers }));
      const found = hit?.[0]?.properties?.projectId;
      if (typeof found === "string") projectId = found;
    }

    if (!projectId && this.pickFallbackPx > 0) {
      let best = this.pickFallbackPx;
      for (const entry of this.entries) {
        const p = safelyValue(() => map.project([entry.lng, entry.lat]));
        if (!p) continue;
        const distance = Math.hypot(p.x - point[0], p.y - point[1]);
        if (distance < best) {
          best = distance;
          projectId = entry.projectId;
        }
      }
    }

    if (!projectId) return;
    e.stopPropagation();
    this.onPick(projectId);
  };

  private handleError = (event: { error?: unknown }) => {
    const error = event.error as (Error & { url?: string }) | undefined;
    if (!error) return;
    const url = error.url ?? "";
    const message = error.message ?? "";
    for (const [projectId, placed] of this.placed) {
      if (url === placed.url || (message && message.includes(placed.url))) {
        this.onLoadError?.(projectId, error, placed.url);
        return;
      }
    }
  };
}

interface PlacedModel {
  url: string;
  modelId: string;
  sourceId: string;
  layerId: string;
  lng: number;
  lat: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
}

const MODEL_SLOT = "middle";
const MASSING_SRC = "rozaris-massing-src";
const MASSING_FILL = "rozaris-massing-fill";
const PICK_SRC = "rozaris-model-pick-src";
const PICK_FILL = "rozaris-model-pick-fill";
const MASSING_COLOR = "#b9b2a6";
const PICK_FALLBACK_PX = 40;
const METERS_PER_DEG_LAT = 111_320;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const STATIC_MODEL_PAINT = {
  "model-opacity": 1,
  "model-emissive-strength": 0.6,
  "model-cast-shadows": true,
  "model-receive-shadows": true,
  "model-ambient-occlusion-intensity": 1,
  "model-elevation-reference": "ground",
} as const;

function placementPaint(entry: MapModelEntry) {
  return {
    "model-scale": [entry.scale, entry.scale, entry.scale],
    "model-rotation": [0, 0, -entry.rotationDeg],
    "model-translation": [0, 0, entry.altitudeOffset],
  };
}

function pointFC(entry: MapModelEntry): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [entry.lng, entry.lat] },
        properties: { projectId: entry.projectId },
      },
    ],
  };
}

function massingFeature(entry: MapModelEntry, box: MassingBox): GeoJSON.Feature<GeoJSON.Polygon> {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((entry.lat * Math.PI) / 180) || METERS_PER_DEG_LAT;
  const centerLng = entry.lng + box.offsetXM / metersPerDegLng;
  const centerLat = entry.lat - box.offsetZM / METERS_PER_DEG_LAT;
  const dLng = box.widthM / 2 / metersPerDegLng;
  const dLat = box.depthM / 2 / METERS_PER_DEG_LAT;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [centerLng - dLng, centerLat - dLat],
          [centerLng + dLng, centerLat - dLat],
          [centerLng + dLng, centerLat + dLat],
          [centerLng - dLng, centerLat + dLat],
          [centerLng - dLng, centerLat - dLat],
        ],
      ],
    },
    properties: { projectId: entry.projectId, height: box.heightM, name: box.name },
  };
}

function idsFor(projectId: string, glbUrl: string) {
  return {
    modelId: `rozaris-model-${projectId}-${hashString(glbUrl)}`,
    sourceId: `rozaris-model-src-${projectId}`,
    layerId: `rozaris-model-layer-${projectId}`,
  };
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function safely(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function safelyValue<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
