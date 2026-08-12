import mapboxgl from "mapbox-gl";

// Half-width, in degrees, of the square area a "hide" target clips when no
// real footprint is available to clip precisely instead — roughly 350m
// across at Tirana's latitude. This is NOT an aesthetic choice: it was the
// smallest size that reliably triggered Mapbox Standard's `clip` layer in
// this app's mapbox-gl version (3.27) *before* `'clip-layer-scope':
// ['basemap']` was added below (see the class doc comment) — a ~220m-wide
// square (or an exact building footprint) silently clipped nothing without
// it. Kept as the fallback for rows with no captured footprint (legacy
// single-point rows, or a pick that genuinely didn't land on a queryable
// building) so nothing regresses even if footprint-precision clipping
// turns out not to work for some other reason.
const CLIP_HALF_WIDTH_DEG = 0.0018;

// Small outward buffer applied to a captured footprint before clipping —
// covers the gap between the tile-simplified footprint geometry and the
// real building edge, and gives the clip a little margin so no sliver of
// the old building peeks out from under the replacement GLB. Degrees, not
// meters — ~2m at Tirana's latitude.
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

/** Naive outward buffer: scales every ring point away from the polygon's
 * own centroid by a small fixed degree amount. Not a real geometric offset
 * (won't handle concave/self-intersecting rings correctly) — real building
 * footprints are near-convex almost universally, and this avoids adding a
 * geometry library (turf) for one small operation, matching this
 * codebase's existing preference for small hand-rolled math over a new
 * dependency (see src/lib/sunPosition.ts). */
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
 * 1. `map.getStyle().layers` + `setFilter`: for an import-based style,
 *    `getStyle().layers` returns effectively nothing — the imported
 *    fragment's internal layers (the actual buildings) aren't exposed
 *    there at all, so this could never find a layer id to filter.
 * 2. `map.setFeatureState(feature, { hide: true })` against the `buildings`
 *    featureset: round-trips via `getFeatureState` but has no visual
 *    effect — Standard's buildings featureset paint only wires up
 *    `highlight`/`select` states, not `hide`.
 *
 * What works: the `clip` style layer
 * (https://docs.mapbox.com/mapbox-gl-js/example/clip-layer-building/) — a
 * GeoJSON polygon source paired with a `type: "clip"` layer removes real
 * Standard buildings inside that polygon.
 *
 * **Multi-building-pick pass (this version)**: the prior version of this
 * class only clipped a fixed ~330m square around one manually-picked
 * point per project, because a smaller/precise polygon "silently clipped
 * nothing" in earlier testing. Comparing against Mapbox's own official
 * clip-layer-building example turned up a real difference: that example's
 * layer sets `'clip-layer-scope': ['basemap']`, which this class never
 * did — and its clip polygon is a real, ~200m, building-shaped shape, not
 * a giant square. `applyClip` now sets that scope and, whenever a real
 * building footprint was captured at pick time, clips that (lightly
 * buffered) footprint instead of a synthetic square — the working
 * hypothesis is that the missing scope, not polygon size, was why small
 * polygons didn't clip before. **This has not been confirmed against a
 * live browser in this pass** (no browser-automation tool was available)
 * — if footprint-precision clipping doesn't actually trigger for some
 * other reason, `applyClip` falls back to the proven-working square
 * automatically (see `squareAround`/`CLIP_HALF_WIDTH_DEG` above), so nothing
 * regresses either way.
 */
export class BuildingHider {
  private map: mapboxgl.Map;
  private targets = new Map<string, { lng: number; lat: number; footprint?: BuildingFootprint | null }>();

  constructor(map: mapboxgl.Map) {
    this.map = map;
  }

  /** Full replace — call whenever the set of "hide the buildings here"
   * targets changes (keyed so re-calling with the same key updates rather
   * than duplicates). */
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

  /** Returns the real building feature under a screen point, if any — used
   * by MapModelEditor's "Pick Buildings to Remove" for the click-to-pick
   * and hover-highlight interactions, and to capture a footprint at pick
   * time (stored, not re-queried later — see class doc comment). Queries
   * the Standard style's `buildings` featureset directly (the only
   * reliable way to reach an import-based style's real layers). */
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
      // No `beforeId`/explicit ordering needed — clip layers apply to the
      // Standard basemap's own buildings regardless of where in the root
      // style's layer list they're added, unlike layers that render visible
      // content themselves.
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
