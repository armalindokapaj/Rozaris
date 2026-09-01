import mapboxgl from "mapbox-gl";

const CLIP_HALF_WIDTH_DEG = 0.0018;

const FOOTPRINT_BUFFER_DEG = 0.00002;

export type BuildingFootprint = GeoJSON.Polygon | GeoJSON.MultiPolygon;

function squareAround(lng: number, lat: number): GeoJSON.Polygon {
  const d = CLIP_HALF_WIDTH_DEG;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ],
  };
}

function bufferFootprint(footprint: BuildingFootprint): BuildingFootprint {
  function bufferRing(ring: [number, number][]): [number, number][] {
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return ring.map(([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * FOOTPRINT_BUFFER_DEG, y + (dy / len) * FOOTPRINT_BUFFER_DEG];
    });
  }
  if (footprint.type === "Polygon") {
    return { type: "Polygon", coordinates: footprint.coordinates.map((ring) => bufferRing(ring as [number, number][])) };
  }
  return {
    type: "MultiPolygon",
    coordinates: footprint.coordinates.map((poly) => poly.map((ring) => bufferRing(ring as [number, number][]))),
  };
}

export class BuildingHider {
  private map: mapboxgl.Map;
  private targets = new Map<string, { lng: number; lat: number; footprint?: BuildingFootprint | null }>();

  constructor(map: mapboxgl.Map) {
    this.map = map;
  }

  setTargets(entries: { key: string; lng: number; lat: number; footprint?: BuildingFootprint | null }[]) {
    const nextKeys = new Set(entries.map((e) => e.key));
    for (const key of this.targets.keys()) {
      if (!nextKeys.has(key)) {
        this.targets.delete(key);
        this.removeClip(key);
      }
    }
    for (const entry of entries) {
      this.targets.set(entry.key, entry);
      this.applyClip(entry.key, entry.lng, entry.lat, entry.footprint ?? null);
    }
  }

  queryBuildingFeatureAt(point: mapboxgl.PointLike): mapboxgl.MapboxGeoJSONFeature | null {
    try {
      const features = this.map.queryRenderedFeatures(point, {
        target: { featuresetId: "buildings", importId: "basemap" },
      });
      return features[0] ?? null;
    } catch {
      return null;
    }
  }

  destroy() {
    for (const key of this.targets.keys()) this.removeClip(key);
  }

  private sourceId(key: string) {
    return `building-hider-src-${key}`;
  }

  private layerId(key: string) {
    return `building-hider-clip-${key}`;
  }

  private applyClip(key: string, lng: number, lat: number, footprint: BuildingFootprint | null) {
    const srcId = this.sourceId(key);
    const layerId = this.layerId(key);
    const geometry = footprint ? bufferFootprint(footprint) : squareAround(lng, lat);
    const data: GeoJSON.Feature = { type: "Feature", properties: {}, geometry };
    const existingSource = this.map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(data);
    } else {
      this.map.addSource(srcId, { type: "geojson", data });
    }
    if (!this.map.getLayer(layerId)) {
      this.map.addLayer({
        id: layerId,
        type: "clip",
        source: srcId,
        slot: "top",
        layout: {
          "clip-layer-types": ["model", "symbol"],
          "clip-layer-scope": ["basemap"],
        },
      });
    }
  }

  private removeClip(key: string) {
    const layerId = this.layerId(key);
    const srcId = this.sourceId(key);
    if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
    if (this.map.getSource(srcId)) this.map.removeSource(srcId);
  }
}
