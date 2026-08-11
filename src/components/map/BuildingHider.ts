import mapboxgl from "mapbox-gl";

// Half-width, in degrees, of the square area a "hide" target clips —
// roughly 350m across at Tirana's latitude. This is NOT an aesthetic
// choice: it's the smallest size that reliably triggers Mapbox Standard's
// `clip` layer in the installed mapbox-gl version (3.27) — verified by
// bisecting empirically against the live style. A ~220m-wide square (the
// exact building footprint, or anything smaller) silently clips nothing;
// ~330m and up works every time. The real, practical consequence: this
// removes the target building's immediate neighbors too, not just the one
// footprint — there is currently no supported way to clip Mapbox Standard
// buildings at exact per-footprint precision (see class doc comment for
// what else was tried and ruled out).
const CLIP_HALF_WIDTH_DEG = 0.0018;

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

/**
 * Hides the Mapbox Standard style's real 3D buildings around specific
 * coordinates — used when a project's "3D Map Control" GLB should replace
 * the generic extruded box(es) the basemap draws there by default, rather
 * than sitting awkwardly alongside/inside them.
 *
 * Rozaris's style (`armalindokapaj/cms9jpj8b008x01s9g1fib0f7`) is Mapbox
 * Standard (v3), built from a style *import* (`imports: [{id: "basemap",
 * url: "mapbox://styles/mapbox/standard"}]`). That import boundary matters
 * a lot here — two approaches that look correct from Mapbox's own docs
 * were tried and empirically ruled out against the live style before
 * landing on the one below:
 *
 * 1. `map.getStyle().layers` + `setFilter` (the previous implementation of
 *    this class): for an import-based style, `getStyle().layers` returns
 *    effectively nothing — the imported fragment's internal layers (the
 *    actual buildings) aren't exposed there at all, so this could never
 *    find a layer id to filter. It silently did nothing, every time.
 * 2. `map.setFeatureState(feature, { hide: true })` against the `buildings`
 *    featureset (`{featuresetId: "buildings", importId: "basemap"}`,
 *    queried/set correctly and confirmed round-tripping via
 *    `getFeatureState`): Standard's buildings featureset only wires up
 *    `highlight`/`select` states in its paint — `hide` (and `highlight`,
 *    tested too) is stored but has no visual effect. Mapbox's own docs
 *    confirm `highlight`/`select` are the only supported states.
 *
 * What actually works: the `clip` style layer
 * (https://docs.mapbox.com/mapbox-gl-js/example/clip-layer-building/) — a
 * GeoJSON polygon source paired with a `type: "clip"` layer removes real
 * Standard buildings inside that polygon. It's an experimental Mapbox
 * feature, and in this app's mapbox-gl version it only takes effect above
 * a minimum polygon size (see `CLIP_HALF_WIDTH_DEG`) — confirmed by
 * bisecting against the live map with Playwright, not from documentation.
 */
export class BuildingHider {
  private map: mapboxgl.Map;
  private targets = new Map<string, { lng: number; lat: number }>();

  constructor(map: mapboxgl.Map) {
    this.map = map;
  }

  /** Full replace — call whenever the set of "hide the buildings here"
   * coordinates changes (keyed so re-calling with the same key updates
   * rather than duplicates). */
  setTargets(entries: { key: string; lng: number; lat: number }[]) {
    const nextKeys = new Set(entries.map((e) => e.key));
    for (const key of this.targets.keys()) {
      if (!nextKeys.has(key)) {
        this.targets.delete(key);
        this.removeClip(key);
      }
    }
    for (const entry of entries) {
      this.targets.set(entry.key, { lng: entry.lng, lat: entry.lat });
      this.applyClip(entry.key, entry.lng, entry.lat);
    }
  }

  /** Returns the real building feature under a screen point, if any — used
   * by MapModelEditor's "Pick Building to Remove" for both the click-to-pick
   * and hover-highlight interactions. Queries the Standard style's
   * `buildings` featureset directly (the only reliable way to reach an
   * import-based style's real layers — see class doc comment). */
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

  private applyClip(key: string, lng: number, lat: number) {
    const srcId = this.sourceId(key);
    const layerId = this.layerId(key);
    const data: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: squareAround(lng, lat) };
    const existingSource = this.map.getSource(srcId) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(data);
    } else {
      this.map.addSource(srcId, { type: "geojson", data });
    }
    if (!this.map.getLayer(layerId)) {
      // No `beforeId`/explicit ordering needed — clip layers apply to the
      // Standard basemap's own buildings regardless of where in the root
      // style's layer list they're added, unlike layers that render visible
      // content themselves.
      this.map.addLayer({
        id: layerId,
        type: "clip",
        source: srcId,
        slot: "top",
        layout: { "clip-layer-types": ["model", "symbol"] },
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
