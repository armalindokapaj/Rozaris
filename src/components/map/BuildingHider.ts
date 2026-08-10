import mapboxgl from "mapbox-gl";

/**
 * Hides the Mapbox Standard style's real 3D building footprint at specific
 * coordinates — used when a project's "3D Map Control" GLB should replace
 * the generic extruded box the basemap draws there by default, rather than
 * sitting awkwardly alongside/inside it.
 *
 * Rozaris's style (`armalindokapaj/cms9jpj8b008x01s9g1fib0f7`) is Mapbox
 * Standard (v3), which renders buildings via `2d-building`/`3d-building`/
 * `procedural-buildings` layers. Standard exposes a `buildings` featureset
 * with `highlight`/`select` feature-states for hover/selection effects, but
 * — checked directly against this style's compiled paint expressions —
 * no `hide` state is wired into any building layer's paint, so
 * `setFeatureState(..., { hide: true })` would silently do nothing here.
 *
 * Instead: each building feature carries a stable per-feature `id` (the
 * style declares `_uniqueFeatureID: true` on its building selectors,
 * specifically so a feature can be targeted reliably) — so this hides a
 * building the more universal way, via `setFilter`, excluding that id from
 * every building/extrusion layer. Building layer ids are discovered at
 * runtime (not hardcoded) so this keeps working if the Studio style is
 * edited or Mapbox revises Standard's internal layer names.
 *
 * Vector-tile features only exist once their tile has loaded, so a
 * coordinate that isn't in/near the current viewport yet won't resolve
 * immediately — this retries on every `idle` event until it does.
 */
export class BuildingHider {
  private map: mapboxgl.Map;
  private targets = new Map<string, { lng: number; lat: number }>();
  private resolvedIds = new Map<string, string | number>();
  private originalFilters = new Map<string, unknown>();
  private buildingLayerIds: string[] = [];

  constructor(map: mapboxgl.Map) {
    this.map = map;
    this.map.on("idle", this.tryResolveAll);
  }

  /** Full replace — call whenever the set of "hide the building here"
   * coordinates changes (keyed so re-calling with the same key updates
   * rather than duplicates). */
  setTargets(entries: { key: string; lng: number; lat: number }[]) {
    const nextKeys = new Set(entries.map((e) => e.key));
    let changed = false;
    for (const key of this.targets.keys()) {
      if (!nextKeys.has(key)) {
        this.targets.delete(key);
        if (this.resolvedIds.delete(key)) changed = true;
      }
    }
    entries.forEach((e) => this.targets.set(e.key, { lng: e.lng, lat: e.lat }));
    this.tryResolveAll();
    if (changed) this.applyFilters();
  }

  destroy() {
    this.map.off("idle", this.tryResolveAll);
    for (const [layerId, original] of this.originalFilters) {
      try {
        this.map.setFilter(layerId, (original as never) ?? null);
      } catch {
        // Layer may already be gone (style swapped) — nothing to restore.
      }
    }
  }

  private discoverBuildingLayers() {
    if (this.buildingLayerIds.length > 0) return;
    const layers = (this.map.getStyle()?.layers ?? []) as { id: string; type: string }[];
    // "fill-extrusion"/"building" cover the generic extruded footprints
    // (this style's 2d-building/3d-building/procedural-buildings); "model"
    // additionally covers Mapbox's pre-modeled real-world landmark
    // buildings (e.g. "building-models") — in the unlikely case a project
    // sits at one of those, it needs hiding the same way.
    this.buildingLayerIds = layers
      .filter(
        (l) =>
          (l.type === "fill-extrusion" || l.type === "building" || l.type === "model") &&
          l.id.toLowerCase().includes("building")
      )
      .map((l) => l.id);
  }

  private tryResolveAll = () => {
    this.discoverBuildingLayers();
    if (this.buildingLayerIds.length === 0 || this.targets.size === 0) return;
    let changed = false;
    for (const [key, coord] of this.targets) {
      if (this.resolvedIds.has(key)) continue;
      const point = this.map.project([coord.lng, coord.lat]);
      const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
        [point.x - 20, point.y - 20],
        [point.x + 20, point.y + 20],
      ];
      let features: mapboxgl.MapboxGeoJSONFeature[] = [];
      try {
        features = this.map.queryRenderedFeatures(bbox, { layers: this.buildingLayerIds });
      } catch {
        // Layer not ready yet this tick — retried on the next `idle`.
      }
      const hit = features.find((f) => f.id != null);
      if (hit?.id != null) {
        this.resolvedIds.set(key, hit.id);
        changed = true;
      }
    }
    if (changed) this.applyFilters();
  };

  private applyFilters() {
    const ids = Array.from(this.resolvedIds.values());
    for (const layerId of this.buildingLayerIds) {
      if (!this.map.getLayer(layerId)) continue;
      if (!this.originalFilters.has(layerId)) {
        this.originalFilters.set(layerId, this.map.getFilter(layerId) ?? null);
      }
      const original = this.originalFilters.get(layerId) as never;
      if (ids.length === 0) {
        this.map.setFilter(layerId, original ?? null);
        continue;
      }
      const exclusion = ["!", ["in", ["id"], ["literal", ids]]] as never;
      this.map.setFilter(layerId, original ? (["all", original, exclusion] as never) : exclusion);
    }
  }
}
