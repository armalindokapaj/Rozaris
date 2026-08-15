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

/**
 * The public marketplace's first real read AND write surface for `Listing`
 * (T0 of the platform audit's roadmap — see "Rozaris Platform Audit"
 * memory). Prior to this route, `prisma.listing` was declared in the schema
 * but written by nothing and read by nothing — `/search`, the listing
 * detail page, and both publisher dashboards all read
 * `mockData.searchableListings` instead.
 *
 * GET without `?publisherId=` — the public catalog: every active,
 * non-deleted listing, newest first. GET with `?publisherId=` — one
 * publisher's own listings for their dashboard ("my listings"), any
 * status, since they need to see pending/archived rows too. Left
 * ungated (same as every other public GET in this app) — this list is no
 * more sensitive than the public listing detail page.
 */
export async function GET(request: Request) {
  const publisherId = new URL(request.url).searchParams.get("publisherId");

  const rows = await prisma.listing.findMany({
    where: publisherId
      ? { publisherId, deletedAt: null }
      : {
          status: "active",
          deletedAt: null,
          // A listing an admin has taken temporarily offline
          // (`idleUntil`) stays out of the public catalog while that
          // window is still running — same "not enforced by a background
          // job, checked on the way out" pattern as lib/moderation.ts.
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
  // Controlled taxonomy (spec item 11 — see MEMORY note
  // "rozaris-controlled-taxonomy-spec"): publishers pick from the real
  // `Amenity` list, they don't type new ones. Was `z.array(z.string())`
  // (unconstrained) — nothing stopped a direct API call from injecting
  // "Car Park"/"Private parking"/"Parking" as three different values for
  // what the UI's own checkbox list treats as one.
  amenities: z.array(z.enum(AMENITY_KEYS as [string, ...string[]])).optional().default([]),
  neighborhoodId: z.string().min(1),
  images: z.array(z.string()).optional().default([]),
  floorPlanImage: z.string().optional(),
  facadeImage: z.string().optional(),
  videoUrl: z.string().optional(),
  // The create form only collects one language at a time — whichever the
  // publisher wrote in gets mirrored into the other field as an
  // untranslated placeholder, same convention `en.ts`/`sq.ts` already use
  // for UI copy (see the "Rozaris locale: English only for now" memory).
  descriptionEn: z.string().min(1),
  descriptionSq: z.string().min(1),
  premium: z.boolean().optional().default(false),
  publisherId: z.string().min(1),
  // The "location drop" requirement (see the "Rozaris Platform Audit"
  // memory) — `lat`/`lng` from a real LocationPicker pin, distinct from
  // the neighborhood centroid fallback below. `locationConfirmed: false`
  // (the default — an old client that's never seen this field, or one
  // that skipped the picker) forces `draft` status regardless of what a
  // publisher requested; only an admin session can bypass that.
  lat: z.number().optional(),
  lng: z.number().optional(),
  locationConfirmed: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;

  const parsed = listingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // Property/Listing split (see MEMORY note "rozaris-controlled-taxonomy-
  // spec") — everything physical about the unit itself goes onto a new
  // `Property` row; everything else (price, media, copy) stays the
  // advertisement's own `Listing` fields.
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

  // A publisher session may only create listings under its own Publisher
  // row; an admin session may act on any (same "admin outranks" pattern
  // requirePublisherSession() itself follows).
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

  // Canonical Location System — validates against the real `locations`
  // table (scripts/seed-locations.ts gives every mockData.neighborhoods id
  // a matching row) instead of trusting client-submitted text. The
  // mockData lookup is kept only as a lat/lng centroid fallback for
  // locations that predate real coordinates — see resolveLocation()'s doc
  // comment.
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

  let slug = slugify(data.title);
  let suffix = 2;
  while (await prisma.listing.findUnique({ where: { slug } })) {
    slug = `${slugify(data.title)}-${suffix}`;
    suffix++;
  }

  // Real, confirmed coordinates win; the neighborhood centroid is only a
  // fallback (still needed either way — `city` always comes from it, and
  // it keeps a draft listing at a sane default point on the map for the
  // rare admin preview before a location's ever set).
  const hasRealLocation = locationConfirmed && lat != null && lng != null;

  // Falls into ListingStatus's own default ("pending") rather than forcing
  // "active" — this is the submit -> admin approve -> publish pipeline the
  // schema header describes, not a direct-to-live publish. It goes live
  // (and starts showing up in `GET /api/listings`'s public catalog) once
  // an admin approves it from the Queue tab, via the pre-existing
  // `PATCH /api/admin/listings/[listingId]/publication` route.
  //
  // Without a confirmed location, this drops to `draft` regardless of the
  // request — invisible everywhere except the publisher's own dashboard —
  // unless the acting session is an admin explicitly choosing to approve
  // it without one (the "location drop" rule's one exception), or unless
  // a Super Admin has switched the `location_drop_required` flag off.
  const locationRuleActive = await isFeatureEnabled("location_drop_required");
  const status =
    hasRealLocation || gate.user.role === "admin" || !locationRuleActive ? "pending" : "draft";

  // Property/Listing split — the physical unit gets its own row first (see
  // MEMORY note "rozaris-controlled-taxonomy-spec"); the ad then points at
  // it. Two `create()`s in one transaction rather than a nested write so
  // both halves stay simple `Unchecked*CreateInput`s — Prisma's generated
  // union type for a nested-relation-plus-scalar-FK mix here doesn't
  // narrow cleanly — while still committing (or failing) atomically.
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
        neighborhoodId,
        city: location.cityName,
        locationId: location.id,
        lat: hasRealLocation ? lat! : fallbackCoords.lat,
        lng: hasRealLocation ? lng! : fallbackCoords.lng,
        locationConfirmed: hasRealLocation,
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

    // Price history's first point — spec item 31 (see MEMORY note
    // "rozaris-controlled-taxonomy-spec"). Every later change goes through
    // `PATCH /api/listings/[listingId]`'s own entry.
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
