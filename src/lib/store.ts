import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AuditLogEntry,
  BuyerPreferences,
  BuyerProfile,
  CompareEntity,
  ConstructionTimelineDraft,
  ConstructionTimelineRequest,
  Conversation,
  Currency,
  FilterState,
  FollowState,
  GeoPoint,
  LeadStatus,
  Listing,
  Locale,
  MobileSheet,
  Project,
  Project3DConfig,
  ProjectDetailModel,
  ProjectMapModel,
  PublisherType,
  RecentlyViewedEntry,
  RecentlyViewedKind,
  SavedSearch,
  TeamMember,
  Unit,
  ViewMode,
} from "./types";
import { DEMO_PUBLISHER, seedConversations } from "./mockData";
import { accountApi } from "./accountApi";

/** Recently Viewed is bounded, not infinite storage (PRD_User §8.3/§20.7). */
const RECENTLY_VIEWED_MAX = 50;

export const defaultBuyerPreferences: BuyerPreferences = {
  transaction: "buy",
  propertyTypes: [],
  priceMax: null,
  location: "Tirana, Albania",
};

// Default until an admin sets a real rate in the Admin Console.
export const DEFAULT_EUR_TO_ALL_RATE = 97;

/** PRD_3D_Project_Viewer §11/§15/§16 — applied until an Admin configures a
 * project's own "3D Experience". Distances are relative multipliers of the
 * project's auto-computed bounding radius (lib/threeBuilding.ts), so they
 * stay sensible whether a project is one small building or a large complex. */
export const defaultProject3DConfig: Project3DConfig = {
  groundEnabled: true,
  groundStyle: "disc",
  groundColor: "#d8d6e6",
  groundFogEnabled: false,
  groundFogRadius: 300,
  cameraStartDistanceMultiplier: 1,
  cameraMinDistanceMultiplier: 0.4,
  cameraMaxDistanceMultiplier: 2.5,
  cameraMaxPolarDeg: 85,
  cameraMinPolarDeg: 0,
  autoRotate: true,
  idleDroneEnabled: true,
  idleDroneDelaySec: 60,
  idleDroneOrbitDurationSec: 80,
  idleDroneClockwise: true,
  idleDroneMotionEnabled: true,
  idleDroneHeightEnabled: true,
  idleDroneHeightAmplitude: 0.18,
  idleDroneDistanceEnabled: true,
  idleDroneDistanceAmplitude: 0.05,
  idleDroneTargetEnabled: true,
  idleDroneTargetAmplitude: 0.06,
  idleDroneVerticalCycles: 2,
  idleDronePhaseOffsetDeg: 0,
  idleDroneSmoothness: 0.88,
  status: "published",
  renderingMode: "auto",
  qualityPreset: "high_desktop",
  customRenderScale: null,
  customDprCap: null,
  adaptiveQualityEnabled: true,
  runtimeQualityReductionEnabled: true,
  interactionQualityReductionEnabled: true,
  deviceDetectionEnabled: true,
  glassPreset: "standard",
  environmentIntensity: 1,
  cameraFovDesktop: 38,
  cameraFovMobile: 48,
  cameraNearClip: 0.1,
  cameraFarClip: 2000,
  cameraMinAzimuthDeg: null,
  cameraMaxAzimuthDeg: null,
  cameraOrbitEnabled: true,
  cameraPanEnabled: true,
  cameraZoomEnabled: true,
  cameraDampingEnabled: true,
  cameraAutoFocusEnabled: true,
  cameraHelperEnabled: false,
  cameraSensorWidthMm: 36,
  cameraPresets: [],
  exposure: 1,
  toneMapping: "aces",
  viewerUI: { home: true, unitSearch: true },
  // Sky/Water/Bloom/Clouds "Ocean" tab — the geographic-sun/HDRI system
  // this replaced (see Project3DConfig's own doc comment) is gone; sun
  // azimuth/elevation are now the only sun model, defaults unchanged.
  sunAzimuthDeg: 180,
  sunElevationDeg: 45,
  // Environment → Sun & Sky's Manual Time + Sun system (PRD §9-10) — off
  // by default, same zero-behavior-change reasoning as everything else in
  // this default object.
  solarControllerEnabled: false,
  solarPathMode: "manual",
  viewerTimeControlEnabled: false,
  viewerTimeHours: 12,
  viewerTimeStartHours: 6,
  viewerTimeEndHours: 20,
  viewerTimeStepMinutes: 15,
  solarAnchors: [],
  geoLatitude: 41.3275,
  geoLongitude: 19.8187,
  simulationDate: "2025-01-01T00:00:00.000Z",
  northOffsetDeg: 0,
  sunDiscEnabled: true,
  autoSunIntensityEnabled: true,
  autoSunColorEnabled: true,
  manualSunIntensity: 1.2,
  manualSunColorHex: "#ffffff",
  environmentRefreshEnabled: true,
  // Standalone "Sky" tab (webgl_shaders_sky.html parity) — defaults match
  // the prior fixed SKY_PHYSICAL_PARAMS constant exactly, so no existing
  // project's rendered sky changes.
  skyEnabled: true,
  skyTurbidity: 4,
  skyRayleigh: 2.4,
  skyMieCoefficient: 0.004,
  skyMieDirectionalG: 0.78,
  // Experience Editor "Map" tab — off/null by default, zero behavior
  // change; lat/lng null falls back to the project's own coords.
  mapViewEnabled: false,
  mapViewLatitude: null,
  mapViewLongitude: null,
  mapViewAltitude: 0,
  mapViewHeadingDeg: 0,
  mapViewScale: 1,
  // Matches the literals ProjectMapView.tsx hardcoded before these fields
  // existed, so an unmigrated row's map still opens exactly as before.
  mapViewZoom: 17.5,
  mapViewPitchDeg: 60,
  mapViewBearingDeg: -20,
  // "Map" tab — real-world site context (see types.ts `siteEnabled`).
  // Every value here is the "feature absent" state, so no existing
  // project changes behavior until an admin turns it on.
  siteEnabled: false,
  siteRadiusM: 600,
  siteTerrainEnabled: true,
  siteImageryEnabled: true,
  siteImageryBrightness: 0.85,
  siteOffsetX: 0,
  siteOffsetZ: 0,
  siteElevationOffset: 0,
  siteRotationDeg: 0,
  siteScale: 1,
  // 360° Backdrop Photo — off/null by default, zero behavior change.
  backdropEnabled: false,
  backdropImageUrl: null,
  backdropRotationDeg: 0,
  backdropPitchDeg: 0,
  backdropElevation: 0,
  fogEnabled: false,
  fogColor: "#c9d6e0",
  fogDensity: 0.015,
  fogMatchesSky: false,
  fogHeightBandEnabled: false,
  fogHazeEnabled: false,
  fogNoiseEnabled: false,
  fogMovementEnabled: true,
  fogSunInteractionEnabled: true,
  fogBaseHeight: 0,
  fogTopHeight: 40,
  fogHaze: 0.3,
  fogNoiseStrength: 0.3,
  fogNoiseScale: 0.05,
  fogWindDirectionDeg: 0,
  fogWindSpeed: 0.02,
  fogFalloff: 1,
  fogMaxOpacity: 0.85,
  // Sky/Water/Bloom/Clouds pass — all off by default (bloom/water/clouds),
  // param defaults mirror webgl_shaders_ocean.html's own GUI defaults
  // exactly (bloom strength 0.1/radius 0, water distortionScale 3.7/
  // size 1, cloud coverage 0.4/density 0.5/elevation 0.5) so turning one
  // on for the first time looks like the reference demo, not an untuned 0.
  bloomEnabled: false,
  bloomStrength: 0.1,
  bloomRadius: 0,
  waterEnabled: false,
  waterDistortionScale: 3.7,
  waterSize: 1,
  waterType: "decorative",
  waterWavesEnabled: true,
  waterMovementEnabled: true,
  waterSunReflectionEnabled: true,
  waterEnvReflectionEnabled: true,
  waterNormalMapEnabled: true,
  waterHeight: 0,
  waterColor: "#001e0f",
  waterDeepColor: "#00131f",
  cloudsEnabled: false,
  cloudCoverage: 0.4,
  cloudDensity: 0.5,
  cloudElevation: 0.5,
  cloudMovementEnabled: true,
  cloudSunLightingEnabled: true,
  cloudShadowsEnabled: false,
  cloudHeight: 220,
  cloudThickness: 50,
  cloudThreshold: 0.45,
  cloudOpacity: 0.85,
  cloudSoftness: 0.35,
  cloudScale: 0.01,
  cloudWindSpeed: 0.02,
  cloudWindDirectionDeg: 45,
  cloudRaymarchSteps: 16,
  // webgl_watch.html — default matches the engine's own previous
  // hardcoded/unset behavior exactly.
  shadowSoftness: 0,
  // 3D LUT — off by default.
  lutEnabled: false,
  lutPreset: "bourbon64",
  lutIntensity: 1,
  // Depth of field — off by default; focalLength/bokehScale match the
  // TSL dof() node's own default GUI values.
  depthOfFieldEnabled: false,
  depthOfFieldFocalLength: 10,
  depthOfFieldBokehScale: 1,
  // Distance Blur — off by default. Start/Full are absolute metres from
  // the camera, not multipliers, so these two numbers mean the same thing
  // on every project regardless of GLB size.
  distanceBlurEnabled: false,
  distanceBlurStartM: 150,
  distanceBlurFullM: 400,
  distanceBlurAmount: 0.9,
  distanceBlurRadius: 2,
  logarithmicDepthEnabled: false,
  // Loading-screen reveal — on by default, see types.ts's own field doc
  // comment for why.
  loadingRevealEnabled: true,
  // Match the previously-hardcoded UNIT_BOX_COLOR/SELECTED_COLOR constants
  // in viewerPresets.ts exactly, so existing projects render identically.
  unitColorAvailable: "#22c55e",
  unitColorReserved: "#eab308",
  unitColorSold: "#ef4444",
  unitColorSelected: "#6b55f5",
  // Units Blocks & POI Layer PRD — same defaults as the real DB columns.
  unitBlocksEnabled: true,
  unitBlocksStatusColorsEnabled: true,
  unitBlocksXrayEnabled: true,
  unitBlocksDefaultOpacity: 0.18,
  unitBlocksHoverOpacity: 0.25,
  unitBlocksSelectedOpacity: 0.32,
  unitBlocksSelectedOutlineEnabled: true,
  unitBlocksSelectedOutlineWidth: 2.5,
  unitBlocksSelectedScaleEnabled: false,
  unitBlocksSelectedScale: 1.05,
  unitBlocksSelectedFillEnabled: true,
  unitColorSelectedFill: "#6b55f5",
  unitBlocksSelectedXrayEnabled: false,
  unitPoiCameraEnabled: true,
  unitPoiCameraFov: 38,
  unitPoiCameraDistanceMultiplier: 3,
  unitPoiCameraHeightOffset: 0.5,
  unitPoiTransitionMs: 900,
  unitPoiAutoOcclusionCorrection: false,
  // Unit-status caustics — off by default.
  causticsEnabled: false,
  causticsScale: 0.5,
  causticsSpeed: 0.15,
  causticsIntensityAvailable: 1,
  causticsIntensityReserved: 0.4,
  causticsIntensitySold: 0,
  shadowsEnabled: true,
  antialiasEnabled: true,
  sections: [],
  // Lighting tab (PRD §14-21) — off/neutral by default, zero behavior
  // change for any existing project.
  sunLightEnabled: true,
  sunTemperatureK: 5500,
  csmEnabled: false,
  csmCascades: 3,
  csmMaxDistance: 200,
  csmResolution: 2048,
  csmSplitMode: "practical",
  csmMargin: 100,
  softShadowsEnabled: true,
  contactShadowsEnabled: false,
  contactShadowBlur: 0.5,
  contactShadowDarkness: 0.6,
  contactShadowOpacity: 0.8,
  contactShadowRange: 0.3,
  transmittedShadowsEnabled: false,
  coloredShadowsEnabled: false,
  transmittedShadowStrength: 0.6,
  giEnabled: false,
  giIndirectEnabled: true,
  giAOEnabled: true,
  giBackfaceLighting: false,
  giTemporalFiltering: true,
  giScreenSpaceSampling: true,
  giIntensity: 10,
  giAOIntensity: 1,
  giRadius: 12,
  giSliceCount: 1,
  giStepCount: 12,
  giExpFactor: 2,
  giThickness: 1,
  giLinearThickness: false,
  artificialLights: [],
  volumetricLightingEnabled: false,
  sunShaftsEnabled: true,
  lightVolumesEnabled: false,
  volumetricRaymarchSteps: 60,
  volumetricDensity: 0.7,
  volumetricMaxDensity: 0.5,
  volumetricDistanceAtten: 2,
  // Rendering tab (PRD §22-33) — off by default, zero behavior change for
  // any existing project.
  ssrEnabled: false,
  ssrIntensity: 1,
  ssrMaxDistance: 30,
  ssrThickness: 0.5,
  ssrQuality: 0.5,
  lensFlareEnabled: false,
  lensFlareIntensity: 1,
  motionBlurEnabled: false,
  motionBlurIntensity: 1,
  updatedAt: "2025-01-01T00:00:00.000Z",
};

/** Applied to a project the moment Admin uploads a GLB, before they've
 * touched any placement slider. 1:1 scale, no rotation/altitude correction —
 * intentionally naive so the preview grid immediately shows whether the
 * source file needs correcting. Starts disabled: an upload alone shouldn't
 * go live on the public map until Admin explicitly enables it. */
export const defaultProjectMapModel: ProjectMapModel = {
  glbUrl: "",
  fileName: "",
  fileSize: 0,
  scale: 1,
  rotationDeg: 0,
  altitudeOffset: 0,
  enabled: false,
  hideBaseBuilding: false,
  hiddenBuildingLng: null,
  hiddenBuildingLat: null,
  updatedAt: "",
};

/** Applied the moment Admin uploads the Project 3D Experience's detailed
 * GLB (Project3DConfigEditor's "Detailed Model" section), before touching
 * any placement slider or linking a single unit box — same "starts
 * disabled" reasoning as defaultProjectMapModel above. */
export const defaultProjectDetailModel: ProjectDetailModel = {
  glbUrl: "",
  fileName: "",
  fileSize: 0,
  scale: 1,
  rotationDeg: 0,
  altitudeOffset: 0,
  positionX: 0,
  positionZ: 0,
  rotationXDeg: 0,
  rotationZDeg: 0,
  enabled: false,
  visible: true,
  castShadow: true,
  receiveShadow: true,
  selectable: true,
  transformLocked: false,
  updatedAt: "",
  unitLinks: [],
  sceneManifest: [],
  nodeOverrides: [],
  triangleCount: null,
  meshCount: null,
  materialCount: null,
  textureCount: null,
};

export const defaultFilters: FilterState = {
  transaction: "buy",
  rentSubtype: undefined,
  location: "Tirana, Albania",
  propertyTypes: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  landAreaMin: null,
  landAreaMax: null,
  buildingPermit: false,
  bedrooms: null,
  bathrooms: null,
  condition: [],
  amenities: [],
  essentialPOIs: [],
  verifiedOnly: false,
  premiumOnly: false,
  projectsOnly: false,
  sort: "recommended",
};

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AuthState {
  signedIn: boolean;
  name: string | null;
  role: "visitor" | "publisher" | "admin" | "buyer";
  /** Only meaningful when role === "publisher" — which of the three
   * PRD account types (Private Publisher / Real Estate Business / Developer)
   * this identity is, per PRD_Authentication_Account_Selection §7. */
  orgType?: PublisherType;
  /** The mock Publisher record (src/lib/mockData.ts) this identity's
   * listings/projects are drawn from. */
  publisherId?: string;
  /** §8 "Business Teams" — "owner" or the real `OrganizationRole` an
   * accepted membership carries; UI-only gating (client convenience), the
   * real enforcement is server-side in `requireOrgRole()`. */
  orgRole?: string;
}

interface SavedState {
  listings: string[];
  projects: string[];
  neighborhoods: string[];
}

interface AppState {
  // Layout / navigation
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  mobileSheet: MobileSheet;
  setMobileSheet: (sheet: MobileSheet) => void;

  // Filters
  filters: FilterState;
  setFilters: (partial: Partial<FilterState>) => void;
  setTransaction: (transaction: FilterState["transaction"]) => void;
  resetFilters: () => void;

  // Live listings — real Postgres `Listing` rows (`GET /api/listings`),
  // fetched once by `useLiveListings()` and shared here so ResultsList and
  // MapView (siblings, not parent/child) both read the same array without
  // each fetching independently. `null` while the initial GET is in
  // flight (or if it's never been triggered on this page) so callers can
  // fall back to `liveListings ?? []` rather than flashing an empty state —
  // same reasoning `useProjectUnits.ts` documents for its own `| null`.
  // Deliberately absent from `partialize` below: this is always refetched,
  // never persisted to localStorage, so it can't ever go stale.
  liveListings: Listing[] | null;
  liveListingsLoading: boolean;
  setLiveListings: (listings: Listing[]) => void;
  setLiveListingsLoading: (loading: boolean) => void;

  // Live projects — real Postgres `Project` rows (`GET /api/projects`),
  // same shape/reasoning as `liveListings` above (fetched once by
  // `useLiveProjects()`, shared so MapView/SearchBar/etc. don't each fetch
  // independently, `null` while in flight, absent from `partialize`).
  liveProjects: Project[] | null;
  liveProjectsLoading: boolean;
  setLiveProjects: (projects: Project[]) => void;
  setLiveProjectsLoading: (loading: boolean) => void;

  // Map / selection
  mapBounds: MapBounds | null;
  setMapBounds: (bounds: MapBounds) => void;
  /** Bounds committed only when the visitor explicitly chooses Search here. */
  mapAreaSearchBounds: MapBounds | null;
  searchThisMapArea: () => void;
  clearMapAreaSearch: () => void;
  selectedListingId: string | null;
  selectedProjectId: string | null;
  hoveredId: string | null;
  selectListing: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  flyToToken: number;
  flyToTarget: (GeoPoint & { zoom?: number }) | null;
  requestFlyTo: (target?: GeoPoint & { zoom?: number }) => void;

  // Compare (CMP-001..006)
  compare: CompareEntity[];
  compareReplaceCandidate: CompareEntity | null;
  addCompare: (item: CompareEntity) => void;
  removeCompareAt: (index: number) => void;
  confirmReplace: (index: number) => void;
  cancelReplace: () => void;
  clearCompare: () => void;
  compareOverlayOpen: boolean;
  setCompareOverlayOpen: (open: boolean) => void;

  // Saved content (BR-019: requires signed-in). Real Postgres-backed as of
  // the Account & Profile System PRD's "User utility" phase — the
  // toggle/add/remove actions below optimistically update local state AND
  // (when signed in) fire the matching /api/account/* write; `hydrate*`
  // setters overwrite local state with the real server list once
  // `AccountDataSync` fetches it on sign-in, same "always refetched"
  // pattern as `liveListings`/`liveProjects` above.
  saved: SavedState;
  toggleSavedListing: (id: string) => void;
  toggleSavedProject: (id: string) => void;
  toggleSavedNeighborhood: (id: string) => void;
  hydrateSaved: (saved: SavedState) => void;
  savedSearches: SavedSearch[];
  addSavedSearch: (search: SavedSearch) => void;
  removeSavedSearch: (id: string) => void;
  hydrateSavedSearches: (searches: SavedSearch[]) => void;

  // Auth — `auth` is a read-mostly mirror of the real Auth.js session,
  // kept in sync by `AuthSessionSync` (mounted once in app/layout.tsx)
  // calling `setAuthFromSession()` on every session change (real auth to
  // UI pass — see the "Rozaris Platform Audit" memory). `signIn()` below
  // predates that and is now just a manual override for the couple of
  // call sites that still want to set it directly (e.g. the Admin
  // console's demo-flag toggle alongside its own real session
  // establishment) — the mirror overwrites it the moment the real session
  // resolves either way, so it can't drift permanently out of sync.
  // Phone/OTP sign-in is still out of scope; email+password only for now.
  auth: AuthState;
  signIn: (
    name: string,
    role?: AuthState["role"],
    orgType?: AuthState["orgType"],
    publisherId?: string
  ) => void;
  signOut: () => void;
  /** The one real write path — syncs `auth` from the actual Auth.js
   * session. `null` means signed out. */
  setAuthFromSession: (
    session: {
      name?: string | null;
      role?: string;
      orgType?: string;
      publisherId?: string;
      orgRole?: string;
    } | null
  ) => void;
  signInModalOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;

  // Following: projects & developers (PRD_User §11). Followed neighborhoods
  // reuse saved.neighborhoods above — Save and Follow are the same action
  // for a neighborhood, since a neighborhood has no individual "save" target.
  following: FollowState;
  toggleFollowProject: (id: string) => void;
  toggleFollowDeveloper: (id: string) => void;
  hydrateFollowing: (following: FollowState) => void;

  // Recently Viewed (PRD_User §8) — bounded history, newest first.
  recentlyViewed: RecentlyViewedEntry[];
  trackView: (kind: RecentlyViewedKind, id: string) => void;
  removeRecentlyViewed: (kind: RecentlyViewedKind, id: string) => void;
  clearRecentlyViewed: () => void;
  hydrateRecentlyViewed: (entries: RecentlyViewedEntry[]) => void;

  // Notifications (PRD_User §13, PRD_Business_Publisher §22, PRD_Private_Publisher §10.4)
  // — the notification *content* is generated per-session from mockActivity.ts;
  // only read-state persists, keyed by notification id.
  readNotificationIds: string[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (ids: string[]) => void;

  // Publisher leads (PRD_Business_Publisher §16, PRD_Private_Publisher §8)
  // — lead content is generated per-session from mockActivity.ts; only
  // status overrides persist, keyed by lead id.
  leadStatusOverrides: Record<string, LeadStatus>;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  leadNotes: Record<string, string>;
  setLeadNotes: (id: string, notes: string) => void;

  // Admin audit trail (PRD_ROZARIS_User_Types §5 "Admin roles & audit") — a
  // session-local stand-in for a real AuditLog table; sensitive admin
  // actions in this prototype (approvals, publish toggles, rate changes)
  // call logAudit so the Audit Log tab has real, growing content instead of
  // seeded copy. Becomes the real Prisma AuditLog model in the backend-
  // wiring phase (see the Rozaris backend plan memory).
  auditLog: AuditLogEntry[];
  logAudit: (action: string, entity: string) => void;

  // Business Publisher company team roster (PRD_ROZARIS_User_Types §4
  // "Company & team") — informational only in this prototype (no real
  // per-seat permissions yet), keyed by publisherId.
  teamMembers: Record<string, TeamMember[]>;
  setTeamMembers: (publisherId: string, members: TeamMember[]) => void;

  // Locale / currency
  currency: Currency;
  setCurrency: (c: Currency) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;

  // EUR -> ALL exchange rate — set manually by an admin in the Admin Console
  // (not fetched from any external source), rounded to a whole number (ALL
  // has no meaningful decimal usage). Applies to every listing/project price
  // shown in ALL immediately.
  eurToAllRate: number;
  eurToAllRateUpdatedAt: string | null;
  setEurToAllRate: (rate: number, updatedAt: string) => void;

  // Onboarding (Section 25.1)
  onboardingDismissed: boolean;
  dismissOnboarding: () => void;

  // Buyer account: profile + saved-preference feed
  buyerProfile: BuyerProfile | null;
  setBuyerProfile: (profile: BuyerProfile) => void;
  updateBuyerPreferences: (partial: Partial<BuyerPreferences>) => void;

  // Buyer <-> Seller messaging (mock — nothing is delivered off-device)
  conversations: Conversation[];
  sendMessage: (conversationId: string, text: string) => void;

  // Construction timeline edits: a publisher's draft only affects what's
  // shown on the live project (projectConstructionOverrides) once an admin
  // approves the request.
  timelineRequests: ConstructionTimelineRequest[];
  projectConstructionOverrides: Record<string, ConstructionTimelineDraft>;
  submitTimelineRequest: (projectId: string, projectName: string, draft: ConstructionTimelineDraft) => void;
  approveTimelineRequest: (requestId: string) => void;
  rejectTimelineRequest: (requestId: string) => void;

  // Admin-created projects (3D Experience tab §11 "Overview" -> a project
  // must exist before Admin can author its scene/units/model). Kept
  // separate from lib/mockData's seeded `projects` array — merged with it
  // wherever the Admin console lists projects — since the seed data is a
  // static module-level constant, not store state.
  customProjects: Project[];
  addProject: (project: Project) => void;
  // Real "delete everything I create" pass — strips a local-only project
  // (created before its real Postgres row existed, or one already deleted
  // server-side) out of persisted state so it stops resurrecting itself
  // across reloads. Safe no-op for an id that was never in `customProjects`
  // (e.g. a fully real project whose only representation is the server).
  removeProject: (projectId: string) => void;
  addProjectUnit: (projectId: string, unit: Unit) => void;
  removeProjectUnit: (projectId: string, unitId: string) => void;
  // Edits a unit's fields in place, `id` untouched — unlike delete-then-
  // re-add, this can never orphan a UnitMeshLinkV2 row (which points at
  // Unit.id, not any of its editable fields) just because an admin changed
  // its status from Available to Reserved/Sold.
  updateProjectUnit: (projectId: string, unitId: string, patch: Partial<Unit>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: "map",
      setMode: (mode) => set({ mode }),
      mobileSheet: "listings",
      setMobileSheet: (mobileSheet) => set({ mobileSheet }),

      filters: defaultFilters,
      setFilters: (partial) =>
        set((s) => ({ filters: { ...s.filters, ...partial } })),
      // Buy and rent use entirely different price/area slider scales, so a
      // value picked under one is meaningless (and out of range) under the
      // other — switching transaction always clears them.
      setTransaction: (transaction) =>
        set((s) => ({
          filters: {
            ...s.filters,
            transaction,
            projectsOnly: false,
            priceMin: null,
            priceMax: null,
            areaMin: null,
            areaMax: null,
          },
        })),
      resetFilters: () => set({ filters: defaultFilters }),

      liveListings: null,
      liveListingsLoading: false,
      setLiveListings: (liveListings) => set({ liveListings, liveListingsLoading: false }),
      setLiveListingsLoading: (liveListingsLoading) => set({ liveListingsLoading }),

      liveProjects: null,
      liveProjectsLoading: false,
      setLiveProjects: (liveProjects) => set({ liveProjects, liveProjectsLoading: false }),
      setLiveProjectsLoading: (liveProjectsLoading) => set({ liveProjectsLoading }),

      mapBounds: null,
      setMapBounds: (mapBounds) => set({ mapBounds }),
      mapAreaSearchBounds: null,
      searchThisMapArea: () =>
        set((s) => ({ mapAreaSearchBounds: s.mapBounds ? { ...s.mapBounds } : null })),
      clearMapAreaSearch: () => set({ mapAreaSearchBounds: null }),
      selectedListingId: null,
      selectedProjectId: null,
      hoveredId: null,
      selectListing: (id) =>
        set({ selectedListingId: id, selectedProjectId: null }),
      selectProject: (id) =>
        set({ selectedProjectId: id, selectedListingId: null }),
      setHovered: (id) => set({ hoveredId: id }),
      flyToToken: 0,
      flyToTarget: null,
      requestFlyTo: (target) =>
        set((s) => ({ flyToToken: s.flyToToken + 1, flyToTarget: target ?? s.flyToTarget })),

      compare: [],
      compareReplaceCandidate: null,
      addCompare: (item) => {
        const current = get().compare;
        const alreadyIn = current.some((c) =>
          c.kind === "listing" && item.kind === "listing"
            ? c.entity.id === item.entity.id
            : c.kind === "unit" && item.kind === "unit"
            ? c.entity.id === item.entity.id
            : false
        );
        if (alreadyIn) return;
        if (current.length < 2) {
          set({ compare: [...current, item] });
        } else {
          // CMP-001: never silently replace — prompt user
          set({ compareReplaceCandidate: item });
        }
      },
      removeCompareAt: (index) =>
        set((s) => ({ compare: s.compare.filter((_, i) => i !== index) })),
      confirmReplace: (index) => {
        const candidate = get().compareReplaceCandidate;
        if (!candidate) return;
        set((s) => {
          const next = [...s.compare];
          next[index] = candidate;
          return { compare: next, compareReplaceCandidate: null };
        });
      },
      cancelReplace: () => set({ compareReplaceCandidate: null }),
      clearCompare: () => set({ compare: [], compareReplaceCandidate: null }),
      compareOverlayOpen: false,
      setCompareOverlayOpen: (compareOverlayOpen) => set({ compareOverlayOpen }),

      saved: { listings: [], projects: [], neighborhoods: [] },
      toggleSavedListing: (id) => {
        set((s) => ({
          saved: {
            ...s.saved,
            listings: s.saved.listings.includes(id)
              ? s.saved.listings.filter((x) => x !== id)
              : [...s.saved.listings, id],
          },
        }));
        if (get().auth.signedIn) accountApi.toggleSaved("listing", id);
      },
      toggleSavedProject: (id) => {
        set((s) => ({
          saved: {
            ...s.saved,
            projects: s.saved.projects.includes(id)
              ? s.saved.projects.filter((x) => x !== id)
              : [...s.saved.projects, id],
          },
        }));
        if (get().auth.signedIn) accountApi.toggleSaved("project", id);
      },
      toggleSavedNeighborhood: (id) => {
        set((s) => ({
          saved: {
            ...s.saved,
            neighborhoods: s.saved.neighborhoods.includes(id)
              ? s.saved.neighborhoods.filter((x) => x !== id)
              : [...s.saved.neighborhoods, id],
          },
        }));
        if (get().auth.signedIn) accountApi.toggleSaved("neighborhood", id);
      },
      hydrateSaved: (saved) => set({ saved }),
      savedSearches: [],
      addSavedSearch: (search) => {
        set((s) => ({ savedSearches: [search, ...s.savedSearches] }));
        if (get().auth.signedIn) {
          accountApi.createSavedSearch({
            name: search.name,
            filtersSummary: search.filtersSummary,
            cadence: search.cadence,
          });
        }
      },
      removeSavedSearch: (id) => {
        set((s) => ({ savedSearches: s.savedSearches.filter((x) => x.id !== id) }));
        if (get().auth.signedIn) accountApi.deleteSavedSearch(id);
      },
      hydrateSavedSearches: (savedSearches) => set({ savedSearches }),

      auth: { signedIn: false, name: null, role: "visitor" },
      signIn: (name, role = "visitor", orgType, publisherId) =>
        set({
          auth: { signedIn: true, name, role, orgType, publisherId },
          signInModalOpen: false,
        }),
      signOut: () => set({ auth: { signedIn: false, name: null, role: "visitor" } }),
      setAuthFromSession: (session) =>
        set({
          auth: session
            ? {
                signedIn: true,
                name: session.name ?? null,
                role: (session.role as AuthState["role"]) ?? "buyer",
                orgType: session.orgType as PublisherType | undefined,
                publisherId: session.publisherId,
                orgRole: session.orgRole,
              }
            : { signedIn: false, name: null, role: "visitor" },
        }),
      signInModalOpen: false,
      openSignIn: () => set({ signInModalOpen: true }),
      closeSignIn: () => set({ signInModalOpen: false }),

      following: { projects: [], developers: [] },
      toggleFollowProject: (id) => {
        set((s) => ({
          following: {
            ...s.following,
            projects: s.following.projects.includes(id)
              ? s.following.projects.filter((x) => x !== id)
              : [...s.following.projects, id],
          },
        }));
        if (get().auth.signedIn) accountApi.toggleFollow("project", id);
      },
      toggleFollowDeveloper: (id) => {
        set((s) => ({
          following: {
            ...s.following,
            developers: s.following.developers.includes(id)
              ? s.following.developers.filter((x) => x !== id)
              : [...s.following.developers, id],
          },
        }));
        if (get().auth.signedIn) accountApi.toggleFollow("developer", id);
      },
      hydrateFollowing: (following) => set({ following }),

      recentlyViewed: [],
      trackView: (kind, id) => {
        set((s) => {
          const withoutThis = s.recentlyViewed.filter((e) => !(e.kind === kind && e.id === id));
          const next = [{ kind, id, viewedAt: new Date().toISOString() }, ...withoutThis];
          return { recentlyViewed: next.slice(0, RECENTLY_VIEWED_MAX) };
        });
        if (get().auth.signedIn) accountApi.trackView(kind, id);
      },
      removeRecentlyViewed: (kind, id) => {
        set((s) => ({
          recentlyViewed: s.recentlyViewed.filter((e) => !(e.kind === kind && e.id === id)),
        }));
        if (get().auth.signedIn) accountApi.removeRecentlyViewed(kind, id);
      },
      clearRecentlyViewed: () => {
        set({ recentlyViewed: [] });
        if (get().auth.signedIn) accountApi.clearRecentlyViewed();
      },
      hydrateRecentlyViewed: (recentlyViewed) => set({ recentlyViewed }),

      readNotificationIds: [],
      markNotificationRead: (id) =>
        set((s) =>
          s.readNotificationIds.includes(id)
            ? s
            : { readNotificationIds: [...s.readNotificationIds, id] }
        ),
      markAllNotificationsRead: (ids) =>
        set((s) => ({ readNotificationIds: Array.from(new Set([...s.readNotificationIds, ...ids])) })),

      leadStatusOverrides: {},
      setLeadStatus: (id, status) => {
        set((s) => ({ leadStatusOverrides: { ...s.leadStatusOverrides, [id]: status } }));
        get().logAudit(`Lead status → ${status}`, id);
      },
      leadNotes: {},
      setLeadNotes: (id, notes) =>
        set((s) => ({ leadNotes: { ...s.leadNotes, [id]: notes } })),

      auditLog: [],
      logAudit: (action, entity) =>
        set((s) => ({
          auditLog: [
            {
              id: `audit-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
              actor: s.auth.name ?? "Admin",
              action,
              entity,
              createdAt: new Date().toISOString(),
            },
            ...s.auditLog,
          ].slice(0, 200),
        })),

      teamMembers: {},
      setTeamMembers: (publisherId, members) =>
        set((s) => ({ teamMembers: { ...s.teamMembers, [publisherId]: members } })),

      currency: "EUR",
      setCurrency: (currency) => set({ currency }),
      locale: "sq",
      setLocale: (locale) => set({ locale }),

      eurToAllRate: DEFAULT_EUR_TO_ALL_RATE,
      eurToAllRateUpdatedAt: null,
      setEurToAllRate: (eurToAllRate, eurToAllRateUpdatedAt) => {
        set({ eurToAllRate, eurToAllRateUpdatedAt });
        get().logAudit("Platform setting changed", `EUR → ALL rate = ${eurToAllRate}`);
      },

      onboardingDismissed: false,
      dismissOnboarding: () => set({ onboardingDismissed: true }),

      buyerProfile: null,
      setBuyerProfile: (buyerProfile) => set({ buyerProfile }),
      updateBuyerPreferences: (partial) =>
        set((s) =>
          s.buyerProfile
            ? { buyerProfile: { ...s.buyerProfile, preferences: { ...s.buyerProfile.preferences, ...partial } } }
            : s
        ),

      conversations: seedConversations,
      sendMessage: (conversationId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const { auth, buyerProfile } = get();
        const isBuyer = auth.role === "buyer";
        const senderId = isBuyer ? buyerProfile?.id ?? "buyer-unknown" : DEMO_PUBLISHER.id;
        const senderName = isBuyer ? buyerProfile?.name ?? auth.name ?? "Buyer" : auth.name ?? DEMO_PUBLISHER.name;
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    {
                      id: `${conversationId}-m${c.messages.length + 1}-${Date.now()}`,
                      senderId,
                      senderName,
                      senderRole: isBuyer ? "buyer" : "publisher",
                      text: trimmed,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : c
          ),
        }));
      },

      timelineRequests: [],
      projectConstructionOverrides: {},
      submitTimelineRequest: (projectId, projectName, draft) => {
        const request: ConstructionTimelineRequest = {
          id: `timeline-${projectId}-${Date.now()}`,
          projectId,
          projectName,
          publisherId: DEMO_PUBLISHER.id,
          publisherName: DEMO_PUBLISHER.name,
          draft,
          status: "pending",
          submittedAt: new Date().toISOString(),
        };
        set((s) => ({ timelineRequests: [request, ...s.timelineRequests] }));
      },
      approveTimelineRequest: (requestId) => {
        const request = get().timelineRequests.find((r) => r.id === requestId);
        if (!request) return;
        set((s) => ({
          timelineRequests: s.timelineRequests.map((r) =>
            r.id === requestId ? { ...r, status: "approved", reviewedAt: new Date().toISOString() } : r
          ),
          projectConstructionOverrides: {
            ...s.projectConstructionOverrides,
            [request.projectId]: request.draft,
          },
        }));
        get().logAudit("Construction update approved", request.projectName);
      },
      rejectTimelineRequest: (requestId) => {
        const request = get().timelineRequests.find((r) => r.id === requestId);
        set((s) => ({
          timelineRequests: s.timelineRequests.map((r) =>
            r.id === requestId ? { ...r, status: "rejected", reviewedAt: new Date().toISOString() } : r
          ),
        }));
        if (request) get().logAudit("Construction update rejected", request.projectName);
      },

      customProjects: [],
      addProject: (project) =>
        set((s) => ({ customProjects: [...s.customProjects, project] })),
      removeProject: (projectId) =>
        set((s) => ({ customProjects: s.customProjects.filter((p) => p.id !== projectId) })),
      addProjectUnit: (projectId, unit) =>
        set((s) => ({
          customProjects: s.customProjects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  units: [...p.units, unit],
                  totalUnits: p.totalUnits + 1,
                  availableUnits:
                    unit.status === "available" ? p.availableUnits + 1 : p.availableUnits,
                }
              : p
          ),
        })),
      removeProjectUnit: (projectId, unitId) =>
        set((s) => ({
          customProjects: s.customProjects.map((p) => {
            if (p.id !== projectId) return p;
            const removed = p.units.find((u) => u.id === unitId);
            return {
              ...p,
              units: p.units.filter((u) => u.id !== unitId),
              totalUnits: Math.max(0, p.totalUnits - 1),
              availableUnits:
                removed?.status === "available"
                  ? Math.max(0, p.availableUnits - 1)
                  : p.availableUnits,
            };
          }),
        })),
      updateProjectUnit: (projectId, unitId, patch) =>
        set((s) => ({
          customProjects: s.customProjects.map((p) => {
            if (p.id !== projectId) return p;
            let availableDelta = 0;
            const units = p.units.map((u) => {
              if (u.id !== unitId) return u;
              if (patch.status && patch.status !== u.status) {
                if (u.status === "available") availableDelta -= 1;
                if (patch.status === "available") availableDelta += 1;
              }
              return { ...u, ...patch };
            });
            return { ...p, units, availableUnits: Math.max(0, p.availableUnits + availableDelta) };
          }),
        })),
    }),
    {
      name: "rozaris-store",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        saved: s.saved,
        savedSearches: s.savedSearches,
        auth: s.auth,
        currency: s.currency,
        locale: s.locale,
        onboardingDismissed: s.onboardingDismissed,
        compare: s.compare,
        eurToAllRate: s.eurToAllRate,
        eurToAllRateUpdatedAt: s.eurToAllRateUpdatedAt,
        buyerProfile: s.buyerProfile,
        conversations: s.conversations,
        timelineRequests: s.timelineRequests,
        projectConstructionOverrides: s.projectConstructionOverrides,
        customProjects: s.customProjects,
        following: s.following,
        recentlyViewed: s.recentlyViewed,
        readNotificationIds: s.readNotificationIds,
        leadStatusOverrides: s.leadStatusOverrides,
        leadNotes: s.leadNotes,
        auditLog: s.auditLog,
        teamMembers: s.teamMembers,
      }),
    }
  )
);
