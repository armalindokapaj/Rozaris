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

export interface Project3DConfig {
  lightingPreset: LightingPreset;
  backgroundPreset: BackgroundPreset;
  groundEnabled: boolean;
  cameraStartDistanceMultiplier: number;
  cameraMinDistanceMultiplier: number;
  cameraMaxDistanceMultiplier: number;
  /** Degrees, 0-180 — caps how far under the building the camera can orbit. */
  cameraMaxPolarDeg: number;
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
  cameraFovDesktop: number;
  cameraFovMobile: number;

  updatedAt: string;
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

/** Admin's "Project 3D Experience" detailed GLB — a second, separate upload
 * from ProjectMapModel above. That one is deliberately minimalistic (search
 * page performance, many projects rendered at once); this one is the real,
 * highly-detailed architectural model for a single project's own viewer
 * page (/project/[slug]), rendered inside a live Mapbox map exactly like the
 * search page's model — just zoomed into one building — instead of the
 * standalone procedural viewer. Authored with individual `Unit_<number>` box
 * nodes baked in; `unitLinks` is Admin's confirmed mapping of those nodes to
 * real Units. When absent or `enabled: false`, the project falls back to the
 * existing procedural Three.js viewer unchanged. */
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
