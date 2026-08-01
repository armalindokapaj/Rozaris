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
