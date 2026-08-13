// ROZARIS core domain types — mirrors PRD Section 26 (Data Model and Entity Specification)

export type Currency = "EUR" | "ALL";
export type Locale = "en" | "sq";

/** Bilingual free-text field — publishers must supply both languages. */
export interface Bilingual {
  en: string;
  sq: string;
}

export type Transaction = "sale" | "rent" | "coming_soon";
export type RentSubtype = "daily" | "long_term";

export type PropertyType =
  | "apartment"
  | "house"
  | "villa"
  | "studio"
  | "land"
  | "commercial"
  | "office";

export type Condition = "new" | "renovated" | "good" | "needs_renovation";

export type ListingStatus =
  | "active"
  | "sold"
  | "rented"
  | "expired"
  | "suspended"
  | "archived";

export type PublisherType = "private_owner" | "agency" | "developer";

export type Amenity =
  | "elevator"
  | "parking"
  | "garage"
  | "balcony"
  | "terrace"
  | "garden"
  | "pool"
  | "accessibility"
  | "furnished";

export type EssentialPOI = "school" | "university" | "bus_stop" | "hospital";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Publisher {
  id: string;
  slug: string;
  name: string;
  type: PublisherType;
  verified: boolean;
  logoUrl?: string;
  phone: string;
  whatsapp: string;
  bio?: string;
  /** HQ city — companies only; a private owner has no company address. */
  city?: string;
  /** Company track record — developers/agencies only, not private owners. */
  foundedYear?: number;
  awardsCount?: number;
}

export interface Neighborhood {
  id: string;
  slug: string;
  name: string;
  city: string;
  coords: GeoPoint;
  listingCount: number;
  description: string;
  essentialPOIs: EssentialPOI[];
}

export interface Listing {
  id: string;
  slug: string;
  title: string;
  transaction: Transaction;
  rentSubtype?: RentSubtype;
  propertyType: PropertyType;
  price: number;
  currency: Currency;
  pricePerSqm?: number;
  negotiable: boolean;
  area: number;
  /** Lot/plot size in m², distinct from the built-up `area` — relevant for
   * villas (their own land) and raw land listings. */
  landArea?: number;
  /** Only meaningful for land listings. */
  buildingPermit?: boolean;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  condition: Condition;
  amenities: Amenity[];
  coords: GeoPoint;
  neighborhoodId: string;
  city: string;
  images: string[];
  floorPlanImage: string;
  facadeImage?: string;
  videoUrl?: string;
  description: Bilingual;
  publisher: Publisher;
  premium: boolean;
  status: ListingStatus;
  createdAt: string;
  buildingListingCount?: number;
  /** Set only on listings synthesized from a new-development project's
   * units, so the unit's own detail page can link back to the project's
   * 3D view. Absent on regular publisher-submitted listings. */
  fromProjectSlug?: string;
  /** The project's display name, paired with fromProjectSlug for the
   * detail page's "part of this project" tag. */
  fromProjectName?: string;
}

export type ProjectStatus = "coming_soon" | "under_construction" | "completed";

export interface ConstructionStage {
  id: string;
  name: string;
  order: number;
  status: "done" | "active" | "upcoming";
  progressPercent: number;
  dateLabel: string;
}

export interface Unit {
  id: string;
  code: string;
  type: "residential" | "commercial" | "parking" | "storage";
  buildingName: string;
  floor: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  price: number;
  currency: Currency;
  transaction: Transaction;
  status: "available" | "reserved" | "sold";
  images: string[];
  floorPlanImage: string;
  facadeImage?: string;
  videoUrl?: string;
}

/** Broad setting a new-development project sits in — used by the New Projects
 * directory's filters, which browse across cities/regions rather than a
 * single map viewport. */
export type ProjectSetting = "residential_complex" | "beach" | "tower";

export interface Project {
  id: string;
  slug: string;
  name: string;
  developer: Publisher;
  status: ProjectStatus;
  progressPercent: number;
  coords: GeoPoint;
  neighborhoodId: string;
  city: string;
  setting: ProjectSetting;
  /** Predominant unit type in this development — used by the New Projects
   * directory's property-type filter. */
  propertyType: PropertyType;
  availableUnits: number;
  totalUnits: number;
  heroImage: string;
  gallery: string[];
  description: Bilingual;
  buildings: string[];
  amenities: Amenity[];
  premium: boolean;
  completionLabel: string;
  units: Unit[];
  constructionStages: ConstructionStage[];
}

/** PRD_3D_Project_Viewer §17: controlled lighting presets — Admin picks
 * one rather than authoring an unrestricted Three.js scene, for
 * consistency across projects and predictable performance. */
export type LightingPreset = "daylight" | "overcast" | "evening";

/** PRD_3D_Project_Viewer §15: approved background presets for the viewer's
 * scene — a plain color/gradient stand-in for an environment/IBL preset. */
export type BackgroundPreset = "sky" | "studio_light" | "studio_dark";

/** PRD_3D_Project_Viewer §11/§15/§16/§21: the persisted "3D Experience"
 * configuration for one project — Admin's Scene/Camera/Lighting/
 * Construction settings, versioned as draft vs. published (§28) rather
 * than edited live in production. Camera distances are stored as
 * multipliers of the procedural building's auto-computed bounding radius
 * (see lib/threeBuilding.ts) since that radius varies per project. */
/** "3D Experience Phase 1" — see src/lib/sunPosition.ts, viewerPresets.ts. */
export type RenderingMode = "auto" | "webgpu" | "webgl2";
export type QualityPreset = "ultra_desktop" | "high_desktop" | "balanced" | "mobile_high" | "mobile_low";
export type GlassPreset = "performance" | "standard" | "premium";
export type SkyPreset = "clear_day" | "soft_day" | "overcast" | "golden_hour" | "evening";
/** Non-glass architectural material presets (Editor UX & Scene Structure
 * pass) — glass already has its own dedicated GlassPreset/GLASS_TIERS
 * system above, kept separate rather than folded in here. */
export type MaterialPresetId =
  | "concrete"
  | "plaster"
  | "stone"
  | "wood"
  | "aluminium"
  | "steel"
  | "chrome"
  | "ceramic";

export interface Project3DConfig {
  lightingPreset: LightingPreset;
  backgroundPreset: BackgroundPreset;
  groundEnabled: boolean;
  cameraStartDistanceMultiplier: number;
  cameraMinDistanceMultiplier: number;
  cameraMaxDistanceMultiplier: number;
  /** Degrees, 0-180 — caps how far under the building the camera can orbit. */
  cameraMaxPolarDeg: number;
  /** Degrees, 0-180 — floor on how far *over the top* the camera can orbit
   * (mirrors cameraMaxPolarDeg's floor/ceiling pair; 0 = can look straight
   * down from directly above, the OrbitControls default). */
  cameraMinPolarDeg: number;
  autoRotate: boolean;
  constructionStagesEnabled: boolean;
  status: "draft" | "published";

  /** Three.js WebGPURenderer target — "auto"/"webgpu" both let the renderer
   * probe for WebGPU and fall back to WebGL2 automatically; "webgl2" forces
   * the WebGL2 backend outright (see forceWebGL in ProceduralProjectViewer). */
  renderingMode: RenderingMode;
  qualityPreset: QualityPreset;
  glassPreset: GlassPreset;
  skyPreset: SkyPreset;
  environmentIntensity: number;
  /** Degrees — rotates the real sun's computed azimuth to match a GLB that
   * wasn't authored north-aligned. */
  northRotationDeg: number;
  /** UTC decimal hour (0-24) the public viewer's Time-of-Day slider starts
   * at — see src/lib/sunPosition.ts for why UTC, not local civil time. */
  defaultTimeOfDay: number;
  allowUserTimeChange: boolean;
  /** "YYYY-MM-DD", or `null` — Sun & Time restructure. `null` means the
   * geographic sun uses the real current calendar date (unchanged
   * default behavior); set means it's simulating that specific date
   * instead (e.g. a solar study for "21 June"). Feeds `calcSunPosition`/
   * `calcSunriseSunset`'s `date` param — see RenderEngine.ts's
   * `applySunAndEnvironment`. */
  simulationDate: string | null;
  cameraFovDesktop: number;
  cameraFovMobile: number;

  /** Admin-saved camera framings — clicking one in the public viewer
   * smoothly transitions the live camera to it (not a snap). */
  cameraPresets: CameraPreset[];
  /** Tone-mapping exposure multiplier — renderer.toneMapping itself is
   * fixed to ACESFilmic, not made per-project configurable this pass. */
  exposure: number;

  /** Which of the always-on bottom-menu controls show publicly — Xray/
   * Camera Presets aren't included here, they're already conditional on
   * real state (a loaded GLB / at least one saved preset). */
  viewerUI: ViewerUIToggles;

  /** `null` = no HDRI, use `skyPreset`'s procedural gradient (unchanged
   * default behavior). Otherwise the environment/reflections come from
   * this shared library entry's `.hdr`/`.exr` instead. */
  hdriId: string | null;
  /** "geographic" (default) computes the sun from real lat/lng/date/time
   * via src/lib/sunPosition.ts, unchanged; "manual" uses the three fields
   * below directly instead. */
  sunMode: "geographic" | "manual";
  /** Degrees, 0-360 — compass direction the sun comes from. Manual mode only. */
  sunAzimuthDeg: number;
  /** Degrees, -90 to 90 — angle above the horizon. Manual mode only. */
  sunElevationDeg: number;
  /** Multiplier on the sun's base intensity — applies under both sun modes
   * (geographic mode used to ignore this entirely; fixed so the slider is
   * meaningful regardless of mode). Defaults to 1, so every project's
   * behavior is unchanged until an admin touches the slider. */
  sunIntensity: number;

  /** Exponential fog (THREE.FogExp2) — off by default, so every existing
   * project renders unchanged until an admin enables it. */
  fogEnabled: boolean;
  fogColor: string;
  /** THREE.FogExp2's density factor — small values (0-0.05ish) are the
   * useful range; higher gets opaque very quickly at typical scene scale. */
  fogDensity: number;
  /** When true, fog color is derived live from the resolved sky/background
   * color instead of `fogColor` above — the "seamless horizon" technique
   * from three.js's webgl_geometry_terrain example. Off by default: zero
   * behavior change for any existing project until an admin enables it. */
  fogMatchesSky: boolean;
  /** Real lens flare attached to the sun (webgl_lensflares.html
   * technique, via three.js's WebGPU-native LensflareMesh port). Off by
   * default. */
  lensflareEnabled: boolean;
  /** Real spherical-harmonics light probe (webgl_lightprobes_sponza.html
   * technique) — direction-dependent indirect lighting captured from the
   * live sky/HDRI environment, supplementing the flat AmbientLight. Off
   * by default — the extra cube-capture cost only happens when enabled. */
  lightProbeEnabled: boolean;
  /** Real stencil-buffer-derived Section cap silhouette
   * (webgl_clipping_stencil.html technique) instead of the default
   * flat-quad cap — see RenderEngine.ts's rebuildSectionCap. Requires a
   * fresh mount to take effect (renderer-construction-time flag). Off by
   * default. */
  sectionCapStencilEnabled: boolean;

  /** Hex colors for the four unit statuses (+ the shared "selected"
   * highlight) shown both in the 3D scene (GLB unit boxes and the
   * procedural box fallback) and the public viewer's status legend/filter
   * dot — see RenderEngine.ts's refreshGlbUnitBoxAppearance/refreshBoxAppearance
   * and ProceduralProjectViewer.tsx's StatusLegend usage. Default values
   * match the previously-hardcoded UNIT_BOX_COLOR/SELECTED_COLOR constants
   * in viewerPresets.ts exactly, so existing projects render identically
   * until an admin changes them. */
  unitColorAvailable: string;
  unitColorReserved: string;
  unitColorSold: string;
  unitColorSelected: string;

  /** Real per-project overrides for the post-processing chain — ANDed with
   * QUALITY_TIERS' own tier-level flags in RenderEngine.ts's
   * buildRenderPipeline, not a replacement for them.
   *
   * `ssrEnabled`/`gtaoEnabled` (screen-space reflections/ambient
   * occlusion) used to live here — removed entirely (schema, API, UI,
   * render pipeline) 2026-08-13 at the user's explicit request after
   * being implicated in a real render-instability report; see
   * viewerPresets.ts's QUALITY_TIERS header comment for the full history.
   * Not just disabled — genuinely gone, no dead toggle left behind. */
  shadowsEnabled: boolean;
  antialiasEnabled: boolean;

  /** Manual clipping-plane sections (Sections module) — admin-authored,
   * real Postgres-backed, same "typed array in a Json column" pattern as
   * `cameraPresets` above. See the `Section` interface's own doc comment. */
  sections: Section[];

  updatedAt: string;
}

/** A shared, platform-wide HDRI environment map — uploaded once, selectable
 * across every project via `Project3DConfig.hdriId`. See PlatformHdri in
 * prisma/schema.prisma. */
export interface PlatformHdri {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface ViewerUIToggles {
  home: boolean;
  unitSearch: boolean;
  timeOfDay: boolean;
  /** Interaction toggles (added alongside the full-configurator pass) —
   * optional since `viewerUI` is a nullable Json? column and every
   * pre-existing row predates these keys; every read site defaults a
   * missing key to `true` (today's hardcoded always-on behavior), same
   * pattern this codebase already established for new Json? keys (see
   * "rozaris-3d-editor-render-hardening" memory). */
  hoverEnabled?: boolean;
  selectEnabled?: boolean;
  showUnitInfo?: boolean;
  /** Public "Sections" bottom-menu button (Sections module, first-class
   * pass) — same optional/defaults-true pattern as the three toggles
   * above. Hidden regardless once `Project3DConfig.sections` is empty,
   * same as the Camera Presets menu button already does. */
  sectionsEnabled?: boolean;
}

export interface CameraPreset {
  id: string;
  label: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
  /** Transition duration when this preset is clicked, ms. */
  durationMs: number;
}

/** One manual clipping-section — a rectangular, rotatable, finite cut
 * volume through the detail GLB (Sections module, first-class pass).
 * Authored in the admin editor by drawing/dragging directly in the
 * viewport (`RenderEngine.ts`'s section methods, `TransformControls`-
 * driven); persisted as one entry in `Project3DConfig.sections`, the same
 * "typed array in a nullable Json column, flows through the existing
 * draft/update/undo/autosave pipeline for free" pattern `cameraPresets`
 * already established. Never stored inside the GLB itself — the geometry
 * is untouched, only the render-time clipping planes/cap change.
 *
 * `scope`/`buildingName` are a label, not an enforcement mechanism: the
 * clipping volume is already spatially finite (5-6 planes, AND/
 * intersection semantics), so a rectangle drawn over one building only
 * ever clips that building's geometry regardless of scope — see
 * RenderEngine.ts's section-planes doc comment. True per-node building
 * tagging / a "Selected Objects" scope is deferred (no per-node building
 * tag exists on architecture GLB meshes today, only on `Unit` rows).
 *
 * `floorId` is not a foreign key to a real Floor table (none exists) —
 * it's the same `` `${buildingName}::${floor}` `` composite identity
 * `src/lib/units.ts`'s `groupUnitsByFloor` derives from real `Unit`
 * rows, which is also what `BuildingNavRail.tsx`/`UnitsPanel.tsx`'s
 * `selectedFloor` filter already keys on. */
export interface Section {
  id: string;
  name: string;
  scope: "project" | "building";
  buildingName?: string;
  /** World-space footprint, meters — X/Z ground-plane center, Three.js
   * Y-up convention (matches every other spatial field in this app). */
  centerX: number;
  centerZ: number;
  widthM: number;
  depthM: number;
  /** Degrees around the vertical (Y) axis — matches this schema's other
   * angle fields (`cameraMinPolarDeg`, `northRotationDeg`, etc.), all
   * degree-based, not radians. */
  rotationDeg: number;
  /** World-space Y (meters) the horizontal cut plane sits at. */
  heightM: number;
  /** Whether a 6th, bottom clipping plane is also applied — off by
   * default (open-bottomed cut, matching the reference mockup). */
  bottomEnabled: boolean;
  /** The cut's cap surface — real behavior, not just a color: whichever
   * is currently true drives BOTH the material AND whether it renders
   * at all (see RenderEngine.ts's `rebuildSectionCap`):
   * - `fillGapsEnabled: false` (default) — a translucent (50% opacity)
   *   "clip plane indicator" in the admin's own live-preview only,
   *   purely an editing aid (matches the section rectangle it's editing
   *   against) — 100% transparent, i.e. not rendered at all, in the
   *   public viewer, since visitors shouldn't see an abstract reference
   *   plane.
   * - `fillGapsEnabled: true` — a fully opaque, admin-picked `fillColor`
   *   fill, shown in both the editor and the public viewer, so a
   *   customer-facing cutaway doesn't look hollow/broken. */
  fillGapsEnabled: boolean;
  fillColor: string;
  /** Saved via the same `getCameraState()` flow `CameraPanel`'s "Save
   * current view" already uses. Unset = activating this section clips
   * without moving the camera. */
  cameraPreset?: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number };
  floorId?: string;
  /** Excluded from the left rail's default list view and the public
   * viewer's Sections panel — stays in `Project3DConfig.sections`,
   * doesn't delete it. */
  hidden?: boolean;
}

/** Admin's "3D Map Control" — an outdoor GLB placed at a project's real
 * lng/lat on the search map (mapbox-gl custom layer), separate from
 * Project3DConfig above (which governs the *indoor* Pure Three.js viewer
 * at /project/[slug]). The uploaded binary lives in Vercel Blob (a real,
 * shared, permanent URL — see src/app/api/blob/upload); this record is a
 * real Postgres row (`project_map_models`, see src/app/api/map-models) —
 * a real, shared placement any visitor's browser reads, not Zustand. */
export interface ProjectMapModel {
  glbUrl: string;
  fileName: string;
  fileSize: number;
  /** Multiplies the model's authored size so it reads at real-world scale
   * once placed in mercator meters — most GLBs aren't authored in exact
   * meters, so Admin dials this in against the preview's 5m grid. */
  scale: number;
  /** Heading offset in degrees, on top of the model's own orientation —
   * lets Admin align it to the street grid. */
  rotationDeg: number;
  /** Meters above ground level. */
  altitudeOffset: number;
  /** Hidden on the public map without discarding the upload/config. */
  enabled: boolean;
  /** Hides the basemap's real 3D building footprint at this project's
   * coordinates (BuildingHider) — so the GLB replaces it cleanly instead of
   * sitting alongside/inside a generic extruded box. */
  hideBaseBuilding: boolean;
  /** Manually picked anchor point ("Pick Building to Remove" in
   * MapModelEditor) used instead of the project's own coordinates to
   * resolve which real building footprint BuildingHider hides — the
   * project pin doesn't always sit exactly on the footprint that needs to
   * go. Unset (both null/undefined) falls back to the project's own
   * coordinates, same as before this existed. */
  hiddenBuildingLng?: number | null;
  hiddenBuildingLat?: number | null;
  updatedAt: string;
}

/** One admin-confirmed link between a `Unit_<number>` node found inside a
 * ProjectDetailModel's GLB and a real Unit — see ProjectDetailModel below. */
export interface UnitMeshLink {
  meshName: string;
  unitId: string;
}

/** One entry per glTF node in a detail-model GLB, in the source file's own
 * node-array order — computed server-side (src/lib/glbValidate.ts) at
 * upload time, not client-side, since it's derived from the same
 * dependency-free GLB parse that already produces triangle/mesh counts.
 * `rzNodeId` is a deterministic fingerprint (index + slugified name), not
 * an author-embedded persistent identity: it disambiguates true duplicate
 * names and gives Scene Explorer/overrides a clean storage key, but
 * doesn't survive a node being renamed between GLB versions any better
 * than the name itself would — same limitation UnitMeshLink already has,
 * handled the same way (carry forward by name, flag the rest for review). */
export interface SceneManifestNode {
  rzNodeId: string;
  name: string;
  meshIndex: number | null;
  parentRzNodeId: string | null;
  depth: number;
  isMesh: boolean;
  autoClassification: "unit_block" | "architecture";
}

/** Admin-assignable node categories (Editor UX & Scene Structure pass,
 * PRD §7). "unit_block" is deliberately excluded here — that stays
 * auto-derived from whether a node is linked via UnitMeshLink, so this
 * classification system and the unit-linking one can't disagree about the
 * same node. */
export type NodeClassification = "architecture" | "landscape" | "interaction" | "helper";

/** Non-destructive override for one GLB node — the original glTF material
 * is never modified; this just says what to render on top of it. Any
 * unset field means "use the GLB's own value for that field." Carried
 * forward by node name when a new GLB version is uploaded, same as
 * UnitMeshLink, and flagged via `carried` so admin knows to double-check
 * it still applies to the right node. */
export interface NodeOverride {
  rzNodeId: string;
  classification?: NodeClassification;
  materialPreset?: MaterialPresetId;
  colorHex?: string;
  roughness?: number;
  metalness?: number;
  /** 0-1. Unset means "use the GLB's own opacity." Applying it also flips
   * the material's `transparent` flag on (see RenderEngine.ts's
   * applyNodeOverrides) — a value of 1 is functionally "opaque" even
   * though it's stored, matching the slider's own full-range default. */
  opacity?: number;
  visible?: boolean;
  carried?: boolean;
}

/** Admin's "Project 3D Experience" detailed GLB — a second, separate upload
 * from ProjectMapModel above. That one is deliberately minimalistic (search
 * page performance, many projects rendered at once); this one is the real,
 * highly-detailed architectural model rendered in the project's own
 * standalone WebGPU/WebGL2 viewer (ProceduralProjectViewer.tsx — "3D
 * Experience Phase 1" replaced the older Mapbox-embedded path this comment
 * used to describe). Authored with individual `Unit_<number>` box nodes
 * baked in; `unitLinks` is Admin's confirmed mapping of those nodes to real
 * Units, `sceneManifest`/`nodeOverrides` are the full node list and any
 * classification/material overrides on top of it. When absent or
 * `enabled: false`, the project falls back to the existing procedural
 * Three.js viewer unchanged. */
/** A named container a project's detail GLBs hang off of — e.g.
 * "Building" and "Surroundings" — so replacing one doesn't touch the
 * other (Multiple Detail-Model Slots pass). Every project has at least
 * one (auto-created "Building" for any project that had a detail model
 * before this existed — see scripts/migrate-detail-model-slots.ts).
 * `ProjectDetailModel` below is now per-slot, not per-project. */
export interface DetailModelSlot {
  id: string;
  projectId: string;
  name: string;
  order: number;
  createdAt: string;
}

export interface ProjectDetailModel {
  glbUrl: string;
  fileName: string;
  fileSize: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  enabled: boolean;
  updatedAt: string;
  unitLinks: UnitMeshLink[];
  sceneManifest: SceneManifestNode[];
  nodeOverrides: NodeOverride[];
  /** Published GLB's own recorded counts (Publish/runtime hardening
   * pass's performance inspector shows these next to the live scene's
   * actual numbers, which can differ once material presets/overrides or
   * procedural elements are layered on top) — null if the version
   * predates server-side validation recording them. */
  triangleCount: number | null;
  meshCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
}

/**
 * The single, versioned authoring-state snapshot for one revision of a
 * project's 3D Experience — rewrite Track B, Phase 1 ("Consolidate the
 * schema into one versioned ExperienceDocument", per the master PRD's
 * non-negotiable principle P2 "One editor state"). Stored as
 * `DetailModelVersion.experienceDocument`, one snapshot per version,
 * mirroring the PRD's `LIVE r12 / DRAFT r13` revision model (a
 * `DetailModelVersion` row already *is* a revision).
 *
 * Deliberately additive for now: built from and alongside the existing
 * scattered fields (`Project3DConfig` + `DetailModelVersion`'s own
 * placement/overrides/links), not yet the thing every read path consumes
 * — see buildExperienceDocument() in src/lib/experienceDocument.ts, the
 * one function that assembles it. The engine module (Phase 1's next step)
 * is the first real consumer; every existing route/hook keeps reading the
 * scattered fields directly, unchanged, for at least one more release.
 */
export interface ExperienceDocument {
  schemaVersion: 1;
  projectId: string;
  /** Multiple Detail-Model Slots pass — one `DetailModelVersion` row (and
   * so one `experienceDocument`) now describes one *slot's* revision, not
   * necessarily "the whole project's 3D experience" (a project can have
   * several independently-versioned slots at once). Kept as a simple
   * per-version fragment rather than aggregating every sibling slot's
   * current state into one document — this field isn't consumed by any
   * live read path yet (see the class doc comment above), so there's
   * nothing that actually needs the aggregate view today, and building it
   * would mean every slot's save re-querying every *other* slot's latest
   * version for no real consumer. */
  slotId: string;
  slotName: string;
  /** = the owning DetailModelVersion's `version` number. */
  revision: number;
  model: {
    scale: number;
    rotationDeg: number;
    altitudeOffset: number;
  };
  materials: {
    overrides: NodeOverride[];
  };
  environment: {
    skyPreset: SkyPreset;
    backgroundPreset: BackgroundPreset;
    environmentIntensity: number;
    hdriId: string | null;
  };
  lighting: {
    sunMode: "geographic" | "manual";
    sunAzimuthDeg: number;
    sunElevationDeg: number;
    sunIntensity: number;
    northRotationDeg: number;
    defaultTimeOfDay: number;
    allowUserTimeChange: boolean;
    simulationDate: string | null;
  };
  camera: {
    presets: CameraPreset[];
    fovDesktop: number;
    fovMobile: number;
    startDistanceMultiplier: number;
    minDistanceMultiplier: number;
    maxDistanceMultiplier: number;
    maxPolarDeg: number;
    autoRotate: boolean;
  };
  effects: {
    qualityPreset: QualityPreset;
    renderingMode: RenderingMode;
    glassPreset: GlassPreset;
    exposure: number;
  };
  units: {
    bindings: UnitMeshLink[];
  };
  /** Sections module — same array `Project3DConfig.sections` already
   * carries, folded into the published snapshot unchanged. */
  sections: Section[];
  viewer: ViewerUIToggles;
  publishing: {
    publicationStatus: "draft" | "published" | "archived";
    validationStatus: "ready" | "warning" | "blocked";
  };
}

export type SavedEntityType = "listing" | "project" | "neighborhood";

export interface SavedSearch {
  id: string;
  name: string;
  filtersSummary: string;
  cadence: "instant" | "daily" | "weekly" | "off";
  createdAt: string;
}

export type CompareEntity =
  | { kind: "listing"; entity: Listing }
  | { kind: "unit"; entity: Unit; projectName: string; projectSlug: string };

export type SortOption =
  | "recommended"
  | "premium"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "area_desc"
  | "area_asc"
  | "distance";

export interface FilterState {
  transaction: "buy" | "rent";
  rentSubtype?: RentSubtype;
  location: string;
  propertyTypes: PropertyType[];
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  landAreaMin: number | null;
  landAreaMax: number | null;
  buildingPermit: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  condition: Condition[];
  amenities: Amenity[];
  essentialPOIs: EssentialPOI[];
  verifiedOnly: boolean;
  premiumOnly: boolean;
  projectsOnly: boolean;
  sort: SortOption;
}

export type ViewMode = "map" | "list";
export type MobileSheet = "listings" | "filters" | "compare" | null;

// --- Buyer account, saved-preference feed, and buyer<->seller messaging ---

export interface BuyerPreferences {
  transaction: "buy" | "rent";
  propertyTypes: PropertyType[];
  priceMax: number | null;
  location: string;
}

export interface BuyerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  preferences: BuyerPreferences;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "buyer" | "publisher";
  text: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  buyerId: string;
  buyerName: string;
  publisherId: string;
  publisherName: string;
  listingTitle?: string;
  listingSlug?: string;
  messages: Message[];
}

// --- Construction timeline edits (publisher-submitted, admin-approved) ---

/** The editable part of a project's construction progress — a publisher
 * drafts one of these and it only takes effect on the live project once an
 * admin approves it. */
export interface ConstructionTimelineDraft {
  progressPercent: number;
  stages: ConstructionStage[];
}

export type TimelineRequestStatus = "pending" | "approved" | "rejected";

export interface ConstructionTimelineRequest {
  id: string;
  projectId: string;
  projectName: string;
  publisherId: string;
  publisherName: string;
  draft: ConstructionTimelineDraft;
  status: TimelineRequestStatus;
  submittedAt: string;
  reviewedAt?: string;
}

// --- User dashboard: Following, Recently Viewed, Notifications ---
// (PRD_User §7 Continue Exploring, §8 Recently Viewed, §11 Following, §13 Notifications)

export type RecentlyViewedKind = "listing" | "project";

export interface RecentlyViewedEntry {
  kind: RecentlyViewedKind;
  id: string;
  viewedAt: string;
}

export interface FollowState {
  projects: string[];
  developers: string[];
}

export type NotificationType =
  | "price_change"
  | "search_match"
  | "listing_availability"
  | "project_update"
  | "developer_update"
  | "account_message"
  | "lead"
  | "moderation"
  | "billing";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  /** Interpolation values for titleKey/bodyKey, e.g. { name: "..." }. */
  vars?: Record<string, string>;
  href?: string;
  createdAt: string;
}

// --- Publisher dashboards: Leads (PRD_Business_Publisher §16, PRD_Private_Publisher §8,
// pipeline stages per PRD_ROZARIS_User_Types §4 "Leads") ---

export type LeadStatus = "new" | "contacted" | "qualified" | "viewing" | "negotiating" | "won" | "lost";
export type LeadSource = "phone_click" | "whatsapp_click" | "listing_inquiry" | "digital_twin_inquiry";

export interface LeadItem {
  id: string;
  publisherId: string;
  listingId?: string;
  projectId?: string;
  source: LeadSource;
  status: LeadStatus;
  createdAt: string;
  /** Free-text follow-up notes an assignee has left — PRD_ROZARIS_User_Types
   * §4 "Lead detail supports notes, assignment and follow-up." Local/mock
   * only, held in Zustand alongside the status override. */
  notes?: string;
}

// --- Admin dashboard: Verification, Moderation, Audit, Team
// (PRD_ROZARIS_User_Types §5) ---

export type VerificationKind =
  | "business_identity"
  | "developer_identity"
  | "phone"
  | "company_documents"
  | "project_authorization";
export type VerificationDecision = "pending" | "approved" | "rejected";

export interface VerificationRequest {
  id: string;
  publisherId: string;
  publisherName: string;
  kind: VerificationKind;
  submittedAt: string;
  status: VerificationDecision;
}

export type ModerationCaseType =
  | "duplicate"
  | "suspicious_price"
  | "misleading_media"
  | "wrong_location"
  | "spam_fraud"
  | "copyright"
  | "user_report";
export type ModerationDecision = "pending" | "dismissed" | "actioned";

export interface ModerationCase {
  id: string;
  entityLabel: string;
  entityHref?: string;
  caseType: ModerationCaseType;
  reportedAt: string;
  status: ModerationDecision;
  evidence: string;
}

/** A session-local stand-in for the real Prisma `AuditLog` table this
 * becomes once the backend-wiring phase lands (see the Rozaris backend
 * plan memory) — every sensitive admin action in this prototype appends
 * one of these via `useAppStore(s => s.logAudit)`. */
export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
}

export type TeamRole = "owner" | "manager" | "sales" | "marketing" | "viewer";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
}
