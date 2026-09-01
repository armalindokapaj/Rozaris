import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { normalizeListing } from "@/lib/listings";
import { slugify } from "@/lib/utils";
import { neighborhoods } from "@/lib/mockData";
import { resolveLocation } from "@/lib/locations";
import { requirePublisherSession } from "@/lib/publisherAuth";
import { isPublisherIdle } from "@/lib/moderation";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { AMENITY_KEYS } from "@/lib/constants";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const publisherId = new URL(request.url).searchParams.get("publisherId");

  const rows = await prisma.listing.findMany({
    where: publisherId
      ? { publisherId, deletedAt: null }
      : {
          status: "active",
          deletedAt: null,
          OR: [{ idleUntil: null }, { idleUntil: { lt: new Date() } }],
        },
    include: { publisher: true, property: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rows.map(normalizeListing));
}

const listingSchema = z.object({
  title: z.string().min(1),
  transaction: z.enum(["sale", "rent", "coming_soon"]),
  rentSubtype: z.enum(["daily", "long_term"]).optional(),
  propertyType: z.enum(["apartment", "house", "villa", "studio", "land", "commercial", "office"]),
  price: z.number().positive(),
  currency: z.enum(["EUR", "ALL"]).optional().default("EUR"),
  negotiable: z.boolean().optional().default(false),
  area: z.number().positive(),
  landArea: z.number().positive().optional(),
  buildingPermit: z.boolean().optional(),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().int().min(0),
  floor: z.number().int().optional(),
  totalFloors: z.number().int().optional(),
  yearBuilt: z.number().int().optional(),
  condition: z.enum(["new", "renovated", "good", "needs_renovation"]),
  amenities: z.array(z.enum(AMENITY_KEYS as [string, ...string[]])).optional().default([]),
  neighborhoodId: z.string().min(1).optional(),
  images: z.array(z.string()).optional().default([]),
  floorPlanImage: z.string().optional(),
  facadeImage: z.string().optional(),
  videoUrl: z.string().optional(),
  descriptionEn: z.string().min(1),
  descriptionSq: z.string().min(1),
  premium: z.boolean().optional().default(false),
  publisherId: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  locationConfirmed: z.boolean().optional().default(false),
  projectId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;

  const limited = rateLimit(`listing-submit:${gate.user?.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const parsed = listingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const {
    publisherId,
    neighborhoodId,
    lat,
    lng,
    locationConfirmed,
    propertyType,
    area,
    landArea,
    buildingPermit,
    bedrooms,
    bathrooms,
    floor,
    totalFloors,
    yearBuilt,
    condition,
    amenities,
    ...data
  } = parsed.data;

  if (gate.user.role !== "admin" && gate.user.publisherId !== publisherId) {
    return NextResponse.json({ error: "You can only publish listings for your own account." }, { status: 403 });
  }

  const publisher = await prisma.publisher.findUnique({ where: { id: publisherId } });
  if (!publisher || publisher.deletedAt) {
    return NextResponse.json(
      { error: `No publisher row for "${publisherId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }
  if (isPublisherIdle(publisher)) {
    return NextResponse.json(
      { error: "This account is restricted from publishing new listings." },
      { status: 403 }
    );
  }

  let project: Awaited<ReturnType<typeof prisma.project.findFirst>> = null;
  if (data.projectId) {
    project = await prisma.project.findFirst({ where: { id: data.projectId, deletedAt: null } });
    if (!project) {
      return NextResponse.json({ error: `Unknown project "${data.projectId}".` }, { status: 400 });
    }
  }

  if (data.unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: data.unitId, deletedAt: null } });
    if (!unit) {
      return NextResponse.json({ error: `Unknown unit "${data.unitId}".` }, { status: 400 });
    }
    if (data.projectId && unit.projectId !== data.projectId) {
      return NextResponse.json({ error: `Unit "${data.unitId}" doesn't belong to project "${data.projectId}".` }, { status: 400 });
    }
  }

  let neighborhoodIdForProperty: string;
  let cityForProperty: string;
  let locationIdForProperty: string | null;
  let latForProperty: number;
  let lngForProperty: number;
  let confirmedForProperty: boolean;

  let slug = slugify(data.title);
  let suffix = 2;
  while (await prisma.listing.findUnique({ where: { slug } })) {
    slug = `${slugify(data.title)}-${suffix}`;
    suffix++;
  }

  if (project) {
    neighborhoodIdForProperty = project.neighborhoodId;
    cityForProperty = project.city;
    locationIdForProperty = project.locationId;
    latForProperty = project.lat;
    lngForProperty = project.lng;
    confirmedForProperty = true;
  } else {
    if (!neighborhoodId) {
      return NextResponse.json(
        { error: "A neighborhood is required for a listing that isn't attached to a project." },
        { status: 400 }
      );
    }
    const location = await resolveLocation(neighborhoodId);
    if (!location) {
      return NextResponse.json({ error: `Unknown location "${neighborhoodId}".` }, { status: 400 });
    }
    const neighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
    const fallbackCoords = location.lat != null && location.lng != null
      ? { lat: location.lat, lng: location.lng }
      : neighborhood?.coords;
    if (!fallbackCoords) {
      return NextResponse.json(
        { error: `Location "${neighborhoodId}" has no coordinates to fall back to.` },
        { status: 400 }
      );
    }
    const hasRealLocation = locationConfirmed && lat != null && lng != null;
    neighborhoodIdForProperty = neighborhoodId;
    cityForProperty = location.cityName;
    locationIdForProperty = location.id;
    latForProperty = hasRealLocation ? lat! : fallbackCoords.lat;
    lngForProperty = hasRealLocation ? lng! : fallbackCoords.lng;
    confirmedForProperty = hasRealLocation;
  }

  const locationRuleActive = await isFeatureEnabled("location_drop_required");
  const status =
    confirmedForProperty || gate.user.role === "admin" || !locationRuleActive ? "pending" : "draft";

  const listing = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        propertyType,
        area,
        landArea,
        buildingPermit,
        bedrooms,
        bathrooms,
        floor,
        totalFloors,
        yearBuilt,
        condition,
        amenities,
        neighborhoodId: neighborhoodIdForProperty,
        city: cityForProperty,
        locationId: locationIdForProperty,
        lat: latForProperty,
        lng: lngForProperty,
        locationConfirmed: confirmedForProperty,
      },
    });

    const created = await tx.listing.create({
      data: {
        ...data,
        slug,
        status,
        publisherId,
        propertyId: property.id,
      },
      include: { publisher: true, property: true },
    });

    await tx.priceHistoryEntry.create({
      data: { listingId: created.id, price: created.price, currency: created.currency },
    });

    return created;
  });

  await logAuditEvent({
    actor: publisher.name,
    action: "Listing created",
    entityType: "Listing",
    entityId: listing.id,
    entityLabel: listing.title,
    newState: listing,
  });

  return NextResponse.json(normalizeListing(listing));
}
