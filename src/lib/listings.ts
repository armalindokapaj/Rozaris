import type { Listing, Publisher } from "./types";

/**
 * Live-listings data layer (T0 of the platform audit's roadmap — see the
 * "Rozaris Platform Audit" memory). Before this, `/search`, the listing
 * detail page, and both publisher dashboards all read
 * `mockData.searchableListings` — a static array — even though the
 * Postgres `Listing`/`Publisher` tables already existed
 * (`prisma/schema.prisma`'s own comment on `Listing.deletedAt` said as
 * much: "no route has ever written a real row here yet"). This file is the
 * one seam between Prisma's flat row shape and the app's nested `Listing`
 * type, mirroring `src/lib/units.ts`'s `normalizeUnit` pattern.
 *
 * Deliberately isomorphic (no `@/lib/db`/Prisma import) so client
 * components can import the `Raw*Row` types without pulling the Prisma
 * client into the browser bundle — only `/api/listings/**` route handlers
 * touch Prisma directly, same convention as the rest of this app.
 *
 * `projectUnitListings` (mockData.ts) — the synthetic listings generated
 * from a new-development project's available units — are NOT part of this
 * migration. They stay mock until Projects/Units get their own public-facing
 * live-data pass; every consumer below concatenates the live array from
 * here with that still-mock array, exactly like `searchableListings` did.
 *
 * Property/Listing/Transaction split (see MEMORY note
 * "rozaris-controlled-taxonomy-spec") — every physical/canonical field
 * (area, bedrooms, condition, amenities, location...) now lives on the
 * Prisma `Property` row a `Listing` points at, not on the Listing row
 * itself. `normalizeListing` below is exactly what absorbs that: every
 * consumer of the app's `Listing` TS type still gets the same flat shape
 * (`area`, `coords`, `neighborhoodId`...) it always did — only this one
 * seam needed to change when the storage moved.
 */

export interface RawPublisherRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  verified: boolean;
  logoUrl: string | null;
  phone: string;
  whatsapp: string | null;
  bio: string | null;
}

/** The Prisma `Property` row's own JSON shape — see the file-header note on
 * the Property/Listing/Transaction split. Every field is nullable at the
 * Prisma level (the schema allows a Property to predate full data), but
 * every real row `POST /api/listings` creates sets all of these — they're
 * only optional here for type honesty. */
export interface RawPropertyRow {
  propertyType: string | null;
  area: number | null;
  landArea: number | null;
  buildingPermit: boolean | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  condition: string | null;
  amenities: string[];
  lat: number | null;
  lng: number | null;
  locationConfirmed: boolean;
  neighborhoodId: string | null;
  city: string | null;
}

/** Raw shape `GET /api/listings*` returns — the Prisma `Listing` row's own
 * JSON shape (flat `descriptionEn`/`descriptionSq`, `publisherId`), not the
 * app's `Listing` type (nested `coords`/`description`/`publisher`).
 * `type`/`transaction`/`propertyType`/`condition`/`amenities` are
 * unconstrained `String`/`String[]` columns in Postgres (no DB enum), same
 * as `Unit` — narrowed with a cast in `normalizeListing` below rather than
 * validated at runtime, since every row reaching this table was itself
 * written through this file's own zod-validated `POST /api/listings`. */
export interface RawListingRow {
  id: string;
  slug: string;
  title: string;
  transaction: string;
  rentSubtype: string | null;
  price: number;
  currency: string;
  negotiable: boolean;
  images: string[];
  floorPlanImage: string | null;
  facadeImage: string | null;
  videoUrl: string | null;
  descriptionEn: string;
  descriptionSq: string;
  premium: boolean;
  status: string;
  createdAt: string | Date;
  lastRenewedAt?: string | Date;
  publisher: RawPublisherRow;
  property: RawPropertyRow;
}

export function normalizePublisher(p: RawPublisherRow): Publisher {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type as Publisher["type"],
    verified: p.verified,
    logoUrl: p.logoUrl ?? undefined,
    phone: p.phone,
    whatsapp: p.whatsapp ?? "",
    bio: p.bio ?? undefined,
  };
}

/** Normalizes one Postgres `listings` row (with its `publisher` and
 * `property` relations included) into the app's `Listing` type — the shape
 * every existing consumer (ListingCard, MapView popups, filtering.ts, the
 * detail page) already assumes, unchanged by the Property/Listing split.
 *
 * Two fields have no real backing column and are intentionally left
 * `undefined` on every live row:
 * - `buildingListingCount` — mockData set this by hand per listing to mark
 *   "this building has N independent listings"; there's no Building entity
 *   in the schema to derive it from for real, so MapView's "multiple
 *   listings in this building" popup simply never triggers for live
 *   listings until a real Building/address-grouping concept exists.
 * - `fromProjectSlug`/`fromProjectName` — only ever set on the still-mock
 *   `projectUnitListings`, never on a publisher-submitted `Listing` row. */
export function normalizeListing(row: RawListingRow): Listing {
  const property = row.property;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    transaction: row.transaction as Listing["transaction"],
    rentSubtype: (row.rentSubtype as Listing["rentSubtype"]) ?? undefined,
    propertyType: property.propertyType as Listing["propertyType"],
    price: row.price,
    currency: row.currency as Listing["currency"],
    pricePerSqm: property.area && property.area > 0 ? Math.round(row.price / property.area) : undefined,
    negotiable: row.negotiable,
    area: property.area ?? 0,
    landArea: property.landArea ?? undefined,
    buildingPermit: property.buildingPermit ?? undefined,
    bedrooms: property.bedrooms ?? 0,
    bathrooms: property.bathrooms ?? 0,
    floor: property.floor ?? undefined,
    totalFloors: property.totalFloors ?? undefined,
    yearBuilt: property.yearBuilt ?? undefined,
    condition: property.condition as Listing["condition"],
    amenities: property.amenities as Listing["amenities"],
    coords: { lat: property.lat ?? 0, lng: property.lng ?? 0 },
    neighborhoodId: property.neighborhoodId ?? "",
    city: property.city ?? "",
    images: row.images,
    floorPlanImage: row.floorPlanImage ?? "",
    facadeImage: row.facadeImage ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
    description: { en: row.descriptionEn, sq: row.descriptionSq },
    publisher: normalizePublisher(row.publisher),
    premium: row.premium,
    status: row.status as Listing["status"],
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
    lastRenewedAt: row.lastRenewedAt
      ? typeof row.lastRenewedAt === "string"
        ? row.lastRenewedAt
        : row.lastRenewedAt.toISOString()
      : undefined,
  };
}
