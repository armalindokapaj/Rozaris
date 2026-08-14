import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { normalizeListing } from "@/lib/listings";
import { slugify } from "@/lib/utils";
import { neighborhoods } from "@/lib/mockData";
import { requirePublisherSession } from "@/lib/publisherAuth";

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
      : { status: "active", deletedAt: null },
    include: { publisher: true },
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
  amenities: z.array(z.string()).optional().default([]),
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
});

export async function POST(request: Request) {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;

  const parsed = listingSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { publisherId, neighborhoodId, ...data } = parsed.data;

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
  if (publisher.restricted) {
    return NextResponse.json(
      { error: "This account is restricted from publishing new listings." },
      { status: 403 }
    );
  }

  // Neighborhoods are still a fixed reference list (mockData.ts), not a
  // Postgres table — there's no Neighborhood entity in the schema to look
  // this up against for real. Its centroid stands in for a real map-pin
  // drop until the create form gets one.
  const neighborhood = neighborhoods.find((n) => n.id === neighborhoodId);
  if (!neighborhood) {
    return NextResponse.json({ error: `Unknown neighborhood "${neighborhoodId}".` }, { status: 400 });
  }

  let slug = slugify(data.title);
  let suffix = 2;
  while (await prisma.listing.findUnique({ where: { slug } })) {
    slug = `${slugify(data.title)}-${suffix}`;
    suffix++;
  }

  // Falls into ListingStatus's own default ("pending") rather than forcing
  // "active" — this is the submit -> admin approve -> publish pipeline the
  // schema header describes, not a direct-to-live publish. It goes live
  // (and starts showing up in `GET /api/listings`'s public catalog) once
  // an admin approves it from the Queue tab, via the pre-existing
  // `PATCH /api/admin/listings/[listingId]/publication` route.
  const listing = await prisma.listing.create({
    data: {
      ...data,
      slug,
      neighborhoodId,
      city: neighborhood.city,
      lat: neighborhood.coords.lat,
      lng: neighborhood.coords.lng,
      publisherId,
    },
    include: { publisher: true },
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
