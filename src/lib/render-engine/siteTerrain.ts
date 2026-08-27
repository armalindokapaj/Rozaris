import * as THREE from "three/webgpu";
import { float, length as tslLength, mix as tslMix, positionLocal, smoothstep as tslSmoothstep, texture as tslTexture, uniform, uv, vec2 } from "three/tsl";

/**
 * "Map" tab — real-world site context built as REAL scene geometry.
 *
 * The whole point of this module is an inversion. The abandoned approach
 * (still visible in the dead StudioBasemapLayer.ts / basemapCameraSync.ts)
 * gave Mapbox the canvas and asked three.js to draw into its WebGL2
 * context. That can never work here: the engine's TSL `RenderPipeline`
 * ends in a full-screen composite that overwrites whatever Mapbox left in
 * the framebuffer, three renders offscreen with its own depth attachment
 * so there is no mutual occlusion, every screen-space effect (SSGI, GTAO,
 * SSR, TRAA, DOF, motion blur) has no depth/normal/velocity for Mapbox's
 * pixels, and binding to Mapbox's context forces `forceWebGL: true`,
 * losing the WebGPU backend the engine is built on.
 *
 * So we take Mapbox's DATA instead of Mapbox's renderer: raster-DEM tiles
 * become vertex displacement, satellite tiles become the albedo, and the
 * result is an ordinary `THREE.Mesh`. Being ordinary geometry is the
 * entire payoff — the site is lit by the ONE Global Sun Vector, casts and
 * receives its shadows, sits in the fog, and flows through SSGI/SSR/DOF/
 * TRAA/LUT with no new plumbing at all.
 *
 * Endpoint shapes and limits below were verified live against this repo's
 * own `NEXT_PUBLIC_MAPBOX_TOKEN` (2026-08-26), not taken from docs:
 *   - `mapbox.satellite`            maxzoom 22, `@2x.jpg90` -> 512x512 JPEG
 *   - `mapbox.mapbox-terrain-dem-v1` maxzoom 14, `.pngraw` -> 256x256 PNG,
 *                                    `@2x.pngraw` -> 512x512 PNG
 * The DEM's hard maxzoom of 14 is why terrain detail is capped the way it
 * is below: at latitude ~41 deg that is ~3.6 m/px with `@2x`, so
 * subdividing the mesh finer than that samples the same heightel twice and
 * buys nothing but triangles.
 */

/** Web Mercator ground resolution at zoom 0 for a 256 px tile, in metres
 * per pixel at the equator. Same constant the (dead) basemapCameraSync
 * used, and the one behind the shared Mapbox/Google/OSM tiling scheme:
 * metresPerPixel(z, lat) = C * cos(lat) / 2^z. */
const GROUND_RESOLUTION_AT_ZOOM_0 = 156543.03392;

const METRES_PER_DEG_LAT = 111_320;

/** Verified out of mapbox-gl 3.27's own bundled DEM unpack table
 * (`{mapbox:[6553.6, 25.6, 0.1, 1e4], terrarium:[...]}`): for a Mapbox
 * raster-DEM tile, height_m = 6553.6*R + 25.6*G + 0.1*B - 10000. Written
 * here in the equivalent, cheaper single-multiply form. */
function decodeDemHeight(r: number, g: number, b: number): number {
  return -10000 + 0.1 * (r * 65536 + g * 256 + b);
}

const DEM_TILESET = "mapbox.mapbox-terrain-dem-v1";
const DEM_MAX_ZOOM = 14; // verified from the tileset's own TileJSON
const SATELLITE_TILESET = "mapbox.satellite";
const SATELLITE_MAX_ZOOM = 22;

/** Target ground resolution for the stitched aerial imagery, in metres per
 * pixel. Driving the texture size from this rather than from a fixed pixel
 * count is what stops a large site from simply getting blurrier: a 2 km
 * site asks for a bigger texture instead of spreading the same 2048 px
 * thinner. ~0.5 m/px is about where Mapbox's own imagery stops being
 * meaningfully sharper at most sites. */
const TARGET_METRES_PER_PIXEL = 0.5;

/** Hard ceiling on the stitched-imagery edge. 4096 is the real limit, not
 * a taste call: 4096*4096*4 = 67 MB of decoded RGBA, which is already a
 * lot of GPU memory to hand a scene that also carries an 800k-triangle
 * building, SSGI, SSR, TRAA and a bloom chain. Small sites never reach it
 * — they hit TARGET_METRES_PER_PIXEL first and stay far cheaper. */
const MAX_IMAGERY_PX = 4096;
const MIN_IMAGERY_PX = 1024;

/** Resolution this site's imagery should be stitched at. Grows with the
 * footprint, then clamps. */
function targetImageryPx(widthM: number): number {
  const ideal = widthM / TARGET_METRES_PER_PIXEL;
  return Math.max(MIN_IMAGERY_PX, Math.min(MAX_IMAGERY_PX, 2 ** Math.ceil(Math.log2(ideal))));
}

/**
 * Radius of the high-resolution DETAIL ring, in metres.
 *
 * Why this exists: one texture stretched across a wide site is coarse
 * everywhere, including the few hundred metres around the building where
 * the visitor actually looks. At a 2 km radius the single wide texture
 * resolves ~1.8 m/px — visibly mushy right at the model's feet. Simply
 * raising MAX_IMAGERY_PX does not fix it: 8192x8192 RGBA is 268 MB, and
 * most of those pixels would be spent on distant ground nobody inspects.
 *
 * So resolution is spent where it is looked at. A second, small, sharp
 * texture covers only this radius and is blended over the wide one in the
 * material. Deliberately a fixed real-world distance rather than a
 * fraction of the site radius — "how close does the visitor get to the
 * building" does not change just because an admin widened the context.
 */
const DETAIL_RADIUS_M = 350;

/** Ground resolution for the detail ring. ~4x finer than the wide sheet's
 * target, which is roughly the ratio between them at the 2 km cap. */
const DETAIL_METRES_PER_PIXEL = 0.15;
const MAX_DETAIL_PX = 2048;

/** Only worth a second fetch + a second texture once the wide sheet is
 * genuinely coarser than the detail ring would be. Below this the wide
 * texture already resolves the middle perfectly well and the detail ring
 * would be pure cost. */
const DETAIL_MIN_SITE_RADIUS_M = 500;

/** Mesh subdivision cap. 192x192 quads = ~73k triangles, which sits an
 * order of magnitude under `VALIDATION_THRESHOLDS.detailModel.warn`
 * (800k) and leaves the budget to the building itself, where it belongs.
 * Raising this past what the DEM's z14 resolution actually carries would
 * add triangles without adding a single new elevation sample. */
const MAX_TERRAIN_SEGMENTS = 192;

export interface SiteTerrainRequest {
  /** The project's canonical location. Deliberately NOT an independently
   * authored coordinate: `Project.lat/lng` is the one source of truth
   * (src/lib/projectLocation.ts exists precisely to kill the three-way
   * drift that independent map coordinates caused). */
  latitude: number;
  longitude: number;
  radiusM: number;
  terrainEnabled: boolean;
  imageryEnabled: boolean;
  accessToken: string;
  /** Aborts every in-flight tile fetch when the caller's request is
   * superseded (an admin dragging the radius slider produces a new
   * request per commit) or the engine unmounts mid-load. */
  signal?: AbortSignal;
}

export interface SiteTerrainResult {
  mesh: THREE.Mesh;
  /** Live imagery-brightness uniform. Null when the site has no imagery
   * (the untextured fallback keeps its authored neutral colour instead). */
  brightnessUniform: { value: number } | null;
  /** Half the site's edge length in scene units (== the requested radius).
   * Surfaced so RenderEngine can give the camera's far plane a floor that
   * actually reaches the site's corners — it cannot derive that from
   * `boundingRadius`, which the site is deliberately excluded from. */
  halfExtentM: number;
  /** Real elevation in metres at the site's centre, i.e. at the project's
   * own coordinates, BEFORE it was normalised away. The mesh itself is
   * built with this subtracted so the project origin sits at local Y=0 —
   * the building's authored ground plane is the datum, not sea level.
   * Surfaced only so the UI can show the admin a real number. */
  centreElevationM: number;
  /** Min/max displaced height in metres relative to the centre, for the
   * same reason — an admin looking at a flat-looking site deserves to see
   * whether the terrain genuinely is flat. */
  reliefM: { min: number; max: number };
  dispose: () => void;
}

function lngLatToTile(lngDeg: number, latDeg: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (latDeg * Math.PI) / 180;
  return {
    x: ((lngDeg + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

function metresPerPixel(zoom: number, latDeg: number, tilePx: number): number {
  return (GROUND_RESOLUTION_AT_ZOOM_0 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom / (tilePx / 256);
}

/**
 * The site's real-world footprint. Kept as a half-extent in metres plus
 * the degree deltas it corresponds to, because the two are needed in
 * different places: metres for the mesh's own dimensions (the scene is
 * 1:1 metric), degrees for working out which tiles to fetch.
 *
 * Uses the flat-earth degree approximation (the same one
 * ProjectModelSource.ts already relies on for massing footprints) rather
 * than a full geodesic solve. Even at the 2000 m cap the error stays well
 * under one DEM sample (~3.6 m at z14), so a more exact solve would be
 * precision theatre.
 */
function siteBounds(latitude: number, longitude: number, radiusM: number) {
  const dLat = radiusM / METRES_PER_DEG_LAT;
  const dLng = radiusM / (METRES_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180));
  return {
    north: latitude + dLat,
    south: latitude - dLat,
    east: longitude + dLng,
    west: longitude - dLng,
    widthM: radiusM * 2,
  };
}

async function fetchImageBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null; // a missing tile is a hole, never a hard failure
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

/**
 * Stitches the tiles covering `bounds` into one canvas and crops to the
 * exact footprint, so the returned texture's edges line up with the mesh's
 * edges rather than with an arbitrary tile boundary.
 *
 * Returns null when imagery is disabled or every tile failed — the caller
 * then falls back to an untextured material rather than showing a broken
 * one.
 */
async function buildImageryTexture(
  bounds: ReturnType<typeof siteBounds>,
  latitude: number,
  accessToken: string,
  signal?: AbortSignal,
  targetPxOverride?: number
): Promise<THREE.Texture | null> {
  // Pick the finest zoom whose stitched output still fits the texture
  // budget, rather than a fixed zoom: a 200 m site deserves far sharper
  // imagery than a 2 km one, and targetImageryPx already scaled the
  // budget to the footprint.
  const targetPx = targetPxOverride ?? targetImageryPx(bounds.widthM);
  let zoom = SATELLITE_MAX_ZOOM;
  for (let z = SATELLITE_MAX_ZOOM; z >= 10; z--) {
    if (bounds.widthM / metresPerPixel(z, latitude, 512) <= targetPx) {
      zoom = z;
      break;
    }
  }

  const topLeft = lngLatToTile(bounds.west, bounds.north, zoom);
  const bottomRight = lngLatToTile(bounds.east, bounds.south, zoom);
  const minX = Math.floor(topLeft.x);
  const maxX = Math.floor(bottomRight.x);
  const minY = Math.floor(topLeft.y);
  const maxY = Math.floor(bottomRight.y);

  const tilePx = 512;
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const canvas = document.createElement("canvas");
  canvas.width = cols * tilePx;
  canvas.height = rows * tilePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const jobs: Promise<void>[] = [];
  let drew = 0;
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const url = `https://api.mapbox.com/v4/${SATELLITE_TILESET}/${zoom}/${tx}/${ty}@2x.jpg90?access_token=${accessToken}`;
      jobs.push(
        fetchImageBitmap(url, signal).then((bmp) => {
          if (!bmp) return;
          ctx.drawImage(bmp, (tx - minX) * tilePx, (ty - minY) * tilePx, tilePx, tilePx);
          bmp.close();
          drew += 1;
        })
      );
    }
  }
  await Promise.all(jobs);
  if (drew === 0) return null;

  // Crop to the exact footprint. Without this the texture would cover
  // whole tiles while the mesh covers the requested radius, and the
  // imagery would sit visibly offset from the terrain under it.
  const cropX = (topLeft.x - minX) * tilePx;
  const cropY = (topLeft.y - minY) * tilePx;
  const cropW = (bottomRight.x - topLeft.x) * tilePx;
  const cropH = (bottomRight.y - topLeft.y) * tilePx;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cropW));
  out.height = Math.max(1, Math.round(cropH));
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height);
  // Release the stitch canvas the moment its pixels have been copied out.
  //
  // This matters on iOS specifically. Canvas backing store there is a
  // scarce, PAGE-WIDE budget rather than ordinary garbage, and it is not
  // reclaimed promptly just because a canvas fell out of scope — WebKit
  // frees it when the element is collected, which can be long after the
  // next large allocation has already been refused. This module allocates
  // the biggest canvases in the app (up to 4096 px square before the crop)
  // and, until this, held the full-size stitch AND its crop alive at once,
  // twice over (imagery + DEM), on top of a WebGPU scene. Zeroing the
  // dimensions drops the backing store immediately and is the documented
  // way to do it. Safe by construction: neither canvas is read again below.
  canvas.width = 0;
  canvas.height = 0;

  const texture = new THREE.CanvasTexture(out);
  // Aerial imagery is authored in sRGB; leaving it in linear space is the
  // classic washed-out-basemap bug.
  texture.colorSpace = THREE.SRGBColorSpace;
  // Clamp, never repeat: the detail sheet is sampled with UVs that run
  // outside 0..1 beyond its own radius, and a repeat there would tile a
  // second ghost copy of the neighbourhood across the whole site.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Fetches the DEM tiles covering `bounds` and decodes them into one dense
 * height grid in metres.
 *
 * Deliberately decodes into a single grid rather than keeping per-tile
 * arrays: the mesh samples heights bilinearly across tile seams, and a
 * per-tile representation would need explicit edge stitching to avoid a
 * visible crack at every tile boundary. One grid makes seams structurally
 * impossible instead of something to remember to fix.
 */
async function buildHeightGrid(
  bounds: ReturnType<typeof siteBounds>,
  accessToken: string,
  signal?: AbortSignal
): Promise<{ data: Float32Array; width: number; height: number } | null> {
  const zoom = DEM_MAX_ZOOM;
  const tilePx = 512; // using @2x
  const topLeft = lngLatToTile(bounds.west, bounds.north, zoom);
  const bottomRight = lngLatToTile(bounds.east, bounds.south, zoom);
  const minX = Math.floor(topLeft.x);
  const maxX = Math.floor(bottomRight.x);
  const minY = Math.floor(topLeft.y);
  const maxY = Math.floor(bottomRight.y);
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;

  const canvas = document.createElement("canvas");
  canvas.width = cols * tilePx;
  canvas.height = rows * tilePx;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const jobs: Promise<void>[] = [];
  let drew = 0;
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const url = `https://api.mapbox.com/v4/${DEM_TILESET}/${zoom}/${tx}/${ty}@2x.pngraw?access_token=${accessToken}`;
      jobs.push(
        fetchImageBitmap(url, signal).then((bmp) => {
          if (!bmp) return;
          ctx.drawImage(bmp, (tx - minX) * tilePx, (ty - minY) * tilePx, tilePx, tilePx);
          bmp.close();
          drew += 1;
        })
      );
    }
  }
  await Promise.all(jobs);
  if (drew === 0) return null;

  const cropX = Math.round((topLeft.x - minX) * tilePx);
  const cropY = Math.round((topLeft.y - minY) * tilePx);
  const cropW = Math.max(2, Math.round((bottomRight.x - topLeft.x) * tilePx));
  const cropH = Math.max(2, Math.round((bottomRight.y - topLeft.y) * tilePx));
  const pixels = ctx.getImageData(cropX, cropY, cropW, cropH).data;
  // Same reasoning as the imagery stitch above — the heights have been
  // copied into `pixels`, so the canvas is dead weight from here on.
  canvas.width = 0;
  canvas.height = 0;

  const data = new Float32Array(cropW * cropH);
  for (let i = 0; i < cropW * cropH; i++) {
    const p = i * 4;
    // A tile that failed to draw leaves transparent black, which decodes
    // to -10000 m. Treating alpha=0 as "no data" and flattening it to 0
    // keeps one missing tile from tearing a 10 km pit in the site.
    data[i] = pixels[p + 3] === 0 ? 0 : decodeDemHeight(pixels[p], pixels[p + 1], pixels[p + 2]);
  }
  return { data, width: cropW, height: cropH };
}

/** Bilinear sample of the height grid at normalised (u, v), v measured
 * from the grid's north edge. Bilinear rather than nearest because at
 * ~3.6 m/px a nearest sample produces visible terracing on any slope. */
function sampleHeight(grid: { data: Float32Array; width: number; height: number }, u: number, v: number): number {
  const x = Math.min(grid.width - 1, Math.max(0, u * (grid.width - 1)));
  const y = Math.min(grid.height - 1, Math.max(0, v * (grid.height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid.width - 1, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const h00 = grid.data[y0 * grid.width + x0];
  const h10 = grid.data[y0 * grid.width + x1];
  const h01 = grid.data[y1 * grid.width + x0];
  const h11 = grid.data[y1 * grid.width + x1];
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

/**
 * Builds the site mesh.
 *
 * ORIENTATION (the part that is easy to get mirrored): the plane is built
 * in XY and rotated -90 deg about X, which maps the plane's local +Y to
 * world -Z. Heights are sampled with v=0 at the grid's north edge, and
 * three.js's default `flipY` texture handling puts image row 0 (also
 * north) at UV v=1, which after the rotation is world -Z. So the site is
 * laid out east = +X, north = -Z: the standard right-handed ENU-to-three
 * mapping, and NOT mirrored.
 *
 * The engine's sun agrees with this frame as of 2026-08-27. It used not
 * to: `sunDirectionVector` put azimuth 0 at +Z, contradicting
 * `SunPosition.azimuthDeg`'s own "0 = north". That was described here as
 * a 180 deg phase difference resolvable by `northOffsetDeg`, but it was
 * actually a reflection across the east-west axis, and no offset can
 * cancel a reflection — see `sunDirectionVector`'s own note. Any project
 * carrying a `northOffsetDeg` that was dialled in against the old
 * mirrored sun needs re-running through the Map panel's "Match sun to
 * real north".
 */
export async function buildSiteTerrain(req: SiteTerrainRequest): Promise<SiteTerrainResult | null> {
  const bounds = siteBounds(req.latitude, req.longitude, req.radiusM);

  // Only fetch a detail sheet when the wide one is actually too coarse in
  // the middle — a 300 m site's single texture already resolves the
  // building's surroundings finely, and a second fetch there would be
  // pure cost for no visible gain.
  const wantsDetail = req.imageryEnabled && req.radiusM > DETAIL_MIN_SITE_RADIUS_M;
  const detailBounds = wantsDetail ? siteBounds(req.latitude, req.longitude, DETAIL_RADIUS_M) : null;
  const detailPx = Math.min(
    MAX_DETAIL_PX,
    2 ** Math.ceil(Math.log2((DETAIL_RADIUS_M * 2) / DETAIL_METRES_PER_PIXEL))
  );

  const [imagery, detail, grid] = await Promise.all([
    req.imageryEnabled ? buildImageryTexture(bounds, req.latitude, req.accessToken, req.signal) : Promise.resolve(null),
    detailBounds
      ? buildImageryTexture(detailBounds, req.latitude, req.accessToken, req.signal, detailPx)
      : Promise.resolve(null),
    req.terrainEnabled ? buildHeightGrid(bounds, req.accessToken, req.signal) : Promise.resolve(null),
  ]);
  if (req.signal?.aborted) {
    imagery?.dispose();
    detail?.dispose();
    return null;
  }

  // No point subdividing finer than the DEM actually resolves — past that
  // every extra vertex re-samples a heightel we already have.
  const demSamplesAcross = grid ? Math.min(grid.width, grid.height) : 2;
  const segments = grid ? Math.max(8, Math.min(MAX_TERRAIN_SEGMENTS, demSamplesAcross)) : 1;

  const geometry = new THREE.PlaneGeometry(bounds.widthM, bounds.widthM, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  let centreElevationM = 0;
  let minRelief = 0;
  let maxRelief = 0;
  if (grid) {
    centreElevationM = sampleHeight(grid, 0.5, 0.5);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const half = bounds.widthM / 2;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const u = (x + half) / bounds.widthM; // +X is east, u grows eastward
      const v = (z + half) / bounds.widthM; // +Z is south, v grows southward = grid row order
      // Normalised against the site centre so the project's own origin
      // sits at local Y=0. The building's authored ground plane is the
      // datum here, never sea level — an 87 m ASL site must not drop the
      // whole world 87 m under a building modelled at Y=0.
      const h = sampleHeight(grid, u, v) - centreElevationM;
      position.setY(i, h);
      if (h < minRelief) minRelief = h;
      if (h > maxRelief) maxRelief = h;
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  // MeshStandardNodeMaterial, not MeshBasicMaterial: the site has to be a
  // real lit surface or none of the payoff lands. Standard is also what
  // writes sensible normals into the shared MRT scene pass, which is what
  // SSGI/SSR/GTAO/TRAA/motion blur all read.
  const material = new THREE.MeshStandardNodeMaterial({
    // Untextured fallback is a muted neutral rather than white — white
    // ground blows out under a physical sky at high sun.
    color: imagery ? 0xffffff : 0x8d8f86,
    roughness: 0.96,
    metalness: 0,
  });

  // Brightness is a live uniform rather than `material.color`, because the
  // colorNode below takes over colour entirely once imagery exists — a
  // plain `.color` write would be ignored. Keeping it a uniform also keeps
  // the slider a uniform write, never a material rebuild.
  const brightnessUniform = uniform(1);

  if (imagery) {
    // The wide sheet, sampled through the plane's own UVs.
    const wide = tslTexture(imagery, uv());

    if (detail) {
      // Detail UVs are derived from object-space position rather than a
      // second UV set: the geometry is a plain PlaneGeometry rotated -90
      // about X, so after that rotation local +X is east and local -Z is
      // north. v must therefore count from the NORTH edge to match how
      // the texture itself is stitched (image row 0 = north, and three's
      // default flipY puts row 0 at v=1) — hence (half - z), not (z + half).
      const half = float(DETAIL_RADIUS_M);
      const detailUv = vec2(
        positionLocal.x.add(half).div(half.mul(2)),
        half.sub(positionLocal.z).div(half.mul(2))
      );
      const sharp = tslTexture(detail, detailUv);
      // Blend out well before the detail texture's own edge so the seam
      // lands inside valid UVs and never samples the clamped border.
      const d = tslLength(positionLocal.xz);
      const blend = tslSmoothstep(half.mul(0.55), half.mul(0.9), d);
      material.colorNode = tslMix(sharp, wide, blend).mul(brightnessUniform);
    } else {
      material.colorNode = wide.mul(brightnessUniform);
    }
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  // Deliberately not castShadow. The site is the ground: it has nothing
  // above it to shadow, and including a 73k-triangle mesh in the shadow
  // pass costs a full extra depth render for no visible result.
  mesh.castShadow = false;
  mesh.name = "rz-site-terrain";
  // Renders before anything else so the building always wins the depth
  // test at the base, and so the site never sorts in front of units.
  mesh.renderOrder = -1;

  return {
    mesh,
    brightnessUniform: imagery ? brightnessUniform : null,
    halfExtentM: bounds.widthM / 2,
    centreElevationM,
    reliefM: { min: minRelief, max: maxRelief },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      imagery?.dispose();
      detail?.dispose();
    },
  };
}
