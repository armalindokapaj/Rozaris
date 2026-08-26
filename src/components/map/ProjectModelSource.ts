import mapboxgl from "mapbox-gl";
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
  /** Data-driven procedural building volumes (see `threeBuilding.ts`'s
   * `computeProjectMassing`) — the map's default 3D hero for a project with
   * no `glbUrl` yet. Real meters, Y-up (X=east, Z=south). */
  massing?: MassingBox[];
  /** Invisible click target for a `glbUrl` entry, in the same units as
   * `massing` above.
   *
   * A native Mapbox `model` layer is NOT returned by
   * `queryRenderedFeatures` (verified against mapbox-gl 3.27: clicks
   * landing squarely on a rendered model come back empty), and the search
   * map deliberately suppresses a modeled project's flat pin — so without
   * this the only way to open a project would be the anchor-proximity
   * fallback in `handleClick`, which misses badly on a tall tower viewed
   * at pitch, where the building's body is nowhere near its ground point.
   *
   * Callers pass the project's own computed massing (the same real
   * unit/floor-derived volumes the no-GLB case renders), so the clickable
   * region is the building's actual footprint and height rather than a
   * guessed radius. Optional: a project with no computable massing just
   * falls back to proximity. */
  pickMassing?: MassingBox[];
}

/**
 * Renders admin-placed project GLBs on a Mapbox map using Mapbox's OWN
 * `model` layer type (`map.addModel()` + `type: "model"`), replacing the
 * Three.js `CustomLayerInterface` in `ProjectModelLayer.ts` for the two
 * pure-Mapbox surfaces: the public Search Map (`MapView.tsx`) and Admin's
 * 3D Map Control preview (`MapModelMapPreview.tsx`).
 *
 * `ProjectModelLayer.ts` is deliberately left in place and untouched — the
 * Experience Editor's "Map" tab and the public Project Viewer both go
 * through `ProjectMapView.tsx`, which needs that layer's per-project
 * `setSun()`; a style has exactly one set of `lights`, so per-project sun
 * direction is the one thing this native path cannot express.
 *
 * Rozaris's style (`armalindokapaj/cmsqj4p0101ao01sd6911ckb4`) is Mapbox
 * Standard v3 (`imports: [{ id: "basemap", url: ".../standard" }]`), which
 * is what makes this possible: it ships real `lights` (ambient +
 * directional with `cast-shadows`), real `terrain` (`mapbox-dem`), and
 * already runs five internal `model` layers of its own (`trees`,
 * `building-models`, `3d-events`). Everything the Three.js layer did by
 * hand — glTF loading, Draco/meshopt decoding, Mercator matrix math,
 * terrain snapping, lighting, shadows, depth ordering, face winding,
 * raycasting — is Mapbox's job here instead:
 *
 *  - loading + Draco/meshopt: compiled into mapbox-gl 3.27 (no gstatic.com
 *    decoder fetch, which an ad blocker could and did break);
 *  - terrain: `model-elevation-reference: "ground"` (the spec default),
 *    instead of polling `queryTerrainElevation()` every frame;
 *  - lighting/shadows: the style's own `lights`, so a model matches the
 *    basemap and follows `lightPreset` for free;
 *  - depth/occlusion: drawn inside Mapbox's own 3D pass, so buildings in
 *    front actually occlude it;
 *  - winding: no Y-up→Z-up negative-scale flip, so no blanket
 *    `DoubleSide` / `frustumCulled = false` workaround.
 *
 * This is not a `CustomLayerInterface` — construct it with the map rather
 * than handing it to `map.addLayer()`.
 */
export class ProjectModelSource {
  private map: mapboxgl.Map;
  private onPick: (projectId: string) => void;
  private onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
  private pickFallbackPx: number;

  /** Last entries handed to `setEntries` — replayed verbatim after a style
   * reload, which drops every source/layer/model we added. */
  private entries: MapModelEntry[] = [];
  private placed = new Map<string, PlacedModel>();
  private styleReady = false;
  private destroyed = false;

  constructor(
    map: mapboxgl.Map,
    opts: {
      onPick: (projectId: string) => void;
      onLoadError?: (projectId: string, error: unknown, glbUrl: string) => void;
      /** Radius, in screen pixels, of the "close enough to the model's
       * anchor" fallback used only when `queryRenderedFeatures` returns
       * nothing for the model layers. Set to 0 to require a real geometry
       * hit. */
      pickFallbackPx?: number;
    }
  ) {
    this.map = map;
    this.onPick = opts.onPick;
    this.onLoadError = opts.onLoadError;
    this.pickFallbackPx = opts.pickFallbackPx ?? PICK_FALLBACK_PX;

    map.getCanvas().addEventListener("click", this.handleClick);
    map.on("error", this.handleError);
    // Every source/layer/model added below belongs to the CURRENT style —
    // a style reload silently drops all of them. `ProjectModelLayer` never
    // handled this (it was added once inside a one-shot `map.on("load")`);
    // rebuilding from `this.entries` here means a reload is a no-op
    // instead of a permanent disappearance.
    map.on("style.load", this.handleStyleLoad);

    if (map.isStyleLoaded()) {
      this.styleReady = true;
      this.ensureMassingLayers();
    } else {
      map.once("style.load", () => {
        /* handleStyleLoad covers it */
      });
    }
  }

  /** Reconcile against the current admin-configured entries (called
   * whenever the visible project list or their map-model config changes). */
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
    // The caller usually follows this with `map.remove()`, at which point
    // the style may already be gone — every teardown below is best-effort.
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

  // ---- style lifecycle ---------------------------------------------------

  private handleStyleLoad = () => {
    if (this.destroyed) return;
    this.styleReady = true;
    // Nothing we registered survived the reload — drop the bookkeeping so
    // `sync()` rebuilds from scratch rather than assuming layers exist.
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

  // ---- GLB models --------------------------------------------------------

  private syncModels(entries: (MapModelEntry & { glbUrl: string })[]) {
    const next = new Map(entries.map((e) => [e.projectId, e]));

    // Tear down anything that's gone — and anything whose GLB URL changed.
    // A changed URL is a full teardown/rebuild rather than an in-place
    // `setLayoutProperty("model-id", ...)`: the model id is derived from a
    // hash of the URL (see `idsFor`), so a replaced GLB is a genuinely
    // different id that Mapbox's internal model cache cannot confuse with
    // the old one. This is the direct fix for "it doesn't reload properly".
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
          // Standard's own 3D content (`trees`, `3d-building`,
          // `building-models`) sits between the `middle` and `top` slots —
          // `middle` puts a project's model in with the city and below
          // every label, which is where a building belongs. Depth ordering
          // against those layers is Mapbox's problem now, not ours.
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

  /**
   * Applies a pure placement change (moved / rescaled / rotated / raised)
   * to an already-registered model, without touching the model itself.
   *
   * The Three.js layer could not do this reliably: a `setEntries` that
   * landed while its `GLTFLoader.load()` was still in flight hit an
   * early-return guard, and the load's own callback then committed the
   * placement captured in the FIRST call's closure — so any adjustment
   * made during the download was silently discarded and never re-applied
   * (the React effect's deps hadn't changed, so nothing fired again).
   * Here there is no in-flight window to miss: the layer exists from the
   * moment it's added, Mapbox swaps the geometry in when the file arrives,
   * and placement is ordinary paint state that can be set at any time.
   */
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

  // ---- procedural massing ------------------------------------------------

  /**
   * The map's stand-in for a project with no admin-uploaded GLB — one
   * extruded volume per building, sized in real meters from
   * `threeBuilding.ts`'s `computeProjectMassing`. Was a `THREE.BoxGeometry`
   * group inside the custom layer; as a plain `fill-extrusion` it costs no
   * geometry of our own, drapes onto terrain by itself, takes the style's
   * lighting, and — unlike the Three.js version — is genuinely queryable,
   * so clicking one still resolves to its project.
   */
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
      // The invisible twin: the same geometry drawn at zero opacity purely
      // so `queryRenderedFeatures` has something to hit where a GLB model
      // stands (see `MapModelEntry.pickMassing`). Feature querying works
      // off the layer's geometry, not its rendered pixels, so a fully
      // transparent extrusion is still returned by a click test — while
      // any non-zero opacity visibly z-fights the GLB it wraps.
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

  // ---- picking -----------------------------------------------------------

  /**
   * Click-to-open. `queryRenderedFeatures` against our own model +
   * massing layers replaces the Three.js layer's manual raycast (build a
   * ray by unprojecting NDC through the inverse projection matrix, then
   * `THREE.Raycaster`), which only worked because that camera's view
   * matrix happened to always be identity.
   *
   * The proximity fallback exists because a `model` layer is not always
   * returned by feature querying (same caveat the reference implementation
   * hit) — nearest anchor within `pickFallbackPx` wins, and only when the
   * real query found nothing.
   */
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

  // ---- errors ------------------------------------------------------------

  /**
   * Best-effort per-model load failures. Mapbox has no per-`addModel`
   * error callback (unlike `GLTFLoader`'s third argument), so a failed GLB
   * surfaces as a generic `error` event — matched back to a project by URL
   * so Admin's preview can still show its "failed to load" state.
   */
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

// ---- internals ------------------------------------------------------------

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
/** Warm architectural gray — deliberately neutral, so a procedural massing
 * volume reads as "real building, no model yet" rather than competing with
 * an actual admin-uploaded GLB's own materials. */
const MASSING_COLOR = "#b9b2a6";
const PICK_FALLBACK_PX = 40;
const METERS_PER_DEG_LAT = 111_320;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Paint that never varies per entry — set once at `addLayer` time.
 * Values match the reference implementation this was ported from:
 * `model-emissive-strength` lifts the model out of Standard's softer
 * daylight, and shadows are what make it read as part of the city rather
 * than pasted on top of it. */
const STATIC_MODEL_PAINT = {
  "model-opacity": 1,
  "model-emissive-strength": 0.6,
  "model-cast-shadows": true,
  "model-receive-shadows": true,
  "model-ambient-occlusion-intensity": 1,
  // The spec default, stated explicitly because it is the entire reason
  // this file has no terrain code: Mapbox snaps the model to the DEM
  // itself, so `model-translation`'s z below is a pure offset above
  // ground rather than an absolute sea-level altitude that has to be
  // re-derived from `queryTerrainElevation()` on every frame.
  "model-elevation-reference": "ground",
} as const;

/** Per-entry placement — the only paint that changes as Admin drags,
 * rescales or rotates. `model-rotation` is [x, y, z] in degrees, with z as
 * the heading; `model-translation` is [east, north, up] in meters.
 *
 * The heading is NEGATED. `rotationDeg` is an existing, admin-authored,
 * already-persisted value (`MapModelVersion.heading`), and every one of
 * those was dialled in against `ProjectModelLayer`'s matrix chain, whose
 * `scale(s, -s, s)` handedness correction made its `makeRotationY(θ)` spin
 * the model the opposite way from Mapbox's own `model-rotation` z.
 * Verified side by side against the real style at the same camera: at
 * θ = 0 the two layers put the footprint down identically, and at θ = 45
 * they land on opposite sides of it. Negating here keeps every stored
 * heading meaning exactly what the admin who set it saw, instead of
 * silently re-orienting every already-published model. */
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

/** One massing box (visible volume or invisible pick target) → a real
 * lng/lat footprint. `MassingBox` offsets are
 * Three.js Y-up meters relative to the project anchor (X east, Z south),
 * the same convention `computeProjectMassing` emits. */
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

/** Model ids are content-addressed by GLB URL so Mapbox's internal model
 * cache can never serve a replaced file's predecessor under the same id.
 * Source/layer ids stay keyed by project alone — they're rebuilt whenever
 * the model id changes anyway. */
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

/** Every style mutation here races a map that may be mid-reload or already
 * removed by the caller's cleanup — a throw from any single one must not
 * abort the rest of a reconcile pass. */
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
