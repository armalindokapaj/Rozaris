import type { ConstructionStage, Listing, Project, Publisher, Unit } from "./types";

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

export interface RawUnitRow {
  id: string;
  code: string;
  type: string;
  buildingName: string;
  floor: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  price: number;
  currency: string;
  transaction: string;
  status: string;
  images: string[];
  floorPlanImage: string | null;
  facadeImage: string | null;
  videoUrl: string | null;
}

export interface RawConstructionStageRow {
  id: string;
  name: string;
  order: number;
  status: string;
  progressPercent: number;
  dateLabel: string;
}

export interface RawProjectRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  progressPercent: number;
  lat: number;
  lng: number;
  neighborhoodId: string;
  city: string;
  setting: string;
  propertyType: string;
  heroImage: string | null;
  gallery: string[];
  descriptionEn: string;
  descriptionSq: string;
  buildings: string[];
  amenities: string[];
  premium: boolean;
  completionLabel: string | null;
  publisher: RawPublisherRow;
  units: RawUnitRow[];
  constructionStages: RawConstructionStageRow[];
}

function normalizePublisher(p: RawPublisherRow): Publisher {
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

function normalizeUnit(row: RawUnitRow): Unit {
  return {
    id: row.id,
    code: row.code,
    type: row.type as Unit["type"],
    buildingName: row.buildingName,
    floor: row.floor,
    area: row.area,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    price: row.price,
    currency: row.currency as Unit["currency"],
    transaction: row.transaction as Unit["transaction"],
    status: row.status as Unit["status"],
    images: row.images,
    floorPlanImage: row.floorPlanImage ?? "",
    facadeImage: row.facadeImage ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
  };
}

function normalizeConstructionStage(row: RawConstructionStageRow): ConstructionStage {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
    status: row.status as ConstructionStage["status"],
    progressPercent: row.progressPercent,
    dateLabel: row.dateLabel,
  };
}

export function normalizeProject(row: RawProjectRow): Project {
  const units = row.units;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    developer: normalizePublisher(row.publisher),
    status: row.status as Project["status"],
    progressPercent: row.progressPercent,
    coords: { lat: row.lat, lng: row.lng },
    neighborhoodId: row.neighborhoodId,
    city: row.city,
    setting: row.setting as Project["setting"],
    propertyType: row.propertyType as Project["propertyType"],
    availableUnits: units.filter((u) => u.status === "available").length,
    totalUnits: units.length,
    heroImage: row.heroImage ?? "",
    gallery: row.gallery,
    description: { en: row.descriptionEn, sq: row.descriptionSq },
    buildings: row.buildings,
    amenities: row.amenities as Project["amenities"],
    premium: row.premium,
    completionLabel: row.completionLabel ?? "",
    units: units.map(normalizeUnit),
    constructionStages: row.constructionStages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(normalizeConstructionStage),
  };
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function jitter(base: number, spread: number, seed: number) {
  return base + (seededRandom(seed) - 0.5) * spread;
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function unitToListing(unit: Unit, project: Project): Listing {
  const seed = hashSeed(`${project.id}-${unit.id}`);
  return {
    id: `unit-${project.id}-${unit.id}`,
    slug: `${project.slug}-${unit.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: `${project.name} — Unit ${unit.code}`,
    transaction: unit.transaction,
    propertyType: project.propertyType,
    price: unit.price,
    currency: unit.currency,
    pricePerSqm: unit.area > 0 ? Math.round(unit.price / unit.area) : undefined,
    negotiable: false,
    area: unit.area,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    floor: unit.floor,
    condition: "new",
    amenities: project.amenities,
    coords: {
      lat: jitter(project.coords.lat, 0.0012, seed),
      lng: jitter(project.coords.lng, 0.0014, seed + 1),
    },
    neighborhoodId: project.neighborhoodId,
    city: project.city,
    images: unit.images,
    floorPlanImage: unit.floorPlanImage,
    facadeImage: unit.facadeImage,
    videoUrl: unit.videoUrl,
    description: project.description,
    publisher: project.developer,
    premium: project.premium,
    status: "active",
    createdAt: "2025-06-01T00:00:00.000Z",
    fromProjectSlug: project.slug,
    fromProjectName: project.name,
  };
}

export function getListingForUnit(project: Project, unit: Unit): Listing | undefined {
  if (unit.status !== "available" || unit.type !== "residential") return undefined;
  return unitToListing(unit, project);
}

export function projectUnitListingsFrom(projects: Project[]): Listing[] {
  return projects.flatMap((p) =>
    p.units.filter((u) => u.status === "available" && u.type === "residential").map((u) => unitToListing(u, p))
  );
}

export function relatedProjectsFrom(projects: Project[], project: Project, count = 3): Project[] {
  const sameNeighborhood = projects.filter((p) => p.id !== project.id && p.neighborhoodId === project.neighborhoodId);
  if (sameNeighborhood.length >= count) return sameNeighborhood.slice(0, count);
  const sameCity = projects.filter(
    (p) => p.id !== project.id && p.city === project.city && !sameNeighborhood.includes(p)
  );
  return [...sameNeighborhood, ...sameCity].slice(0, count);
}
