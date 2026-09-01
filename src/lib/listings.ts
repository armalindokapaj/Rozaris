import type { Listing, Publisher } from "./types";

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
