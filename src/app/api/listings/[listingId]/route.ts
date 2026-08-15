import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { normalizeListing } from "@/lib/listings";
import { requirePublisherSession } from "@/lib/publisherAuth";
import { recordSaleOrRentalIfNewlyCompleted } from "@/lib/transactions";
import { AMENITY_KEYS } from "@/lib/constants";
import { notifyPriceDrop, notifyAvailabilityChange } from "@/lib/notify";

// Same fields as POST /api/listings' create schema, all optional — a
// dashboard edit only sends the fields that changed.
const patchSchema = z.object({
  title: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  currency: z.enum(["EUR", "ALL"]).optional(),
  negotiable: z.boolean().optional(),
  area: z.number().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  condition: z.enum(["new", "renovated", "good", "needs_renovation"]).optional(),
  // Controlled taxonomy (spec item 11 — see MEMORY note
  // "rozaris-controlled-taxonomy-spec") — same enum `POST /api/listings`
  // enforces at creation.
  amenities: z.array(z.enum(AMENITY_KEYS as [string, ...string[]])).optional(),
  images: z.array(z.string()).optional(),
  descriptionEn: z.string().min(1).optional(),
  descriptionSq: z.string().min(1).optional(),
  status: z.enum(["active", "sold", "rented", "expired", "suspended", "archived"]).optional(),
  premium: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  locationConfirmed: z.boolean().optional(),
  /// "Still available / confirm listing" — bumps `lastRenewedAt` to now,
  /// clearing the >90-day staleness flag. A real field on the request
  /// (not inferred from "any PATCH counts as a renewal") so a silent admin
  /// edit doesn't quietly reset a publisher's own staleness clock.
  renew: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;

  const { listingId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { property: true },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  if (gate.user.role !== "admin" && gate.user.publisherId !== existing.publisherId) {
    return NextResponse.json({ error: "You can only edit your own listings." }, { status: 403 });
  }
  // "active"/"suspended" are moderation outcomes, not a publisher's own
  // edit — those go through PATCH /api/admin/listings/[id]/publication
  // (Admin's Queue tab) so a listing can't skip review by self-approving.
  if (gate.user.role !== "admin" && (parsed.data.status === "active" || parsed.data.status === "suspended")) {
    return NextResponse.json({ error: "Only an admin can publish or suspend a listing." }, { status: 403 });
  }

  // Property/Listing split (see MEMORY note "rozaris-controlled-taxonomy-
  // spec") — an edit can touch either row, so this route now writes both
  // in one transaction rather than a single `listing.update()`.
  const { renew, area, bedrooms, bathrooms, condition, amenities, lat, lng, locationConfirmed, ...listingFields } =
    parsed.data;
  const propertyFields = { area, bedrooms, bathrooms, condition, amenities, lat, lng, locationConfirmed };
  const hasPropertyEdit = Object.values(propertyFields).some((v) => v !== undefined);
  const nowConfirmed = locationConfirmed ?? existing.property.locationConfirmed;

  const listing = await prisma.$transaction(async (tx) => {
    if (hasPropertyEdit) {
      await tx.property.update({ where: { id: existing.propertyId }, data: propertyFields });
    }
    const updated = await tx.listing.update({
      where: { id: listingId },
      data: {
        ...listingFields,
        ...(renew ? { lastRenewedAt: new Date() } : {}),
        // A draft that just got a real location for the first time re-enters
        // the normal review pipeline automatically — the publisher shouldn't
        // have to separately know to "resubmit" on top of adding a pin.
        ...(existing.status === "draft" && nowConfirmed && !listingFields.status
          ? { status: "pending" as const }
          : {}),
      },
      include: { publisher: true, property: true },
    });

    // Real Transaction event — see src/lib/transactions.ts's doc comment.
    // A publisher marking their own listing sold/rented (a deal closed
    // outside the platform) is a real sale/rental event, not just a status
    // label change.
    await recordSaleOrRentalIfNewlyCompleted(tx, {
      listingId: updated.id,
      previousStatus: existing.status,
      newStatus: updated.status,
      transactionType: updated.transaction,
      rentSubtype: updated.rentSubtype,
      price: updated.price,
      currency: updated.currency,
    });

    // Price history — spec item 31 (see MEMORY note "rozaris-controlled-
    // taxonomy-spec"): "never overwrite a price silently." Only a real
    // change in the numeric value gets a new point (a currency-only edit
    // with the same number, or a no-op resave, doesn't).
    if (listingFields.price != null && listingFields.price !== existing.price) {
      await tx.priceHistoryEntry.create({
        data: { listingId: updated.id, price: updated.price, currency: updated.currency },
      });
    }

    return updated;
  });

  // Real notification producers (Account & Profile System PRD v1.0 §5.3 —
  // see src/lib/notify.ts) — outside the transaction since a saver
  // notification failing shouldn't roll back the listing edit itself.
  if (listingFields.price != null && listingFields.price < existing.price) {
    await notifyPriceDrop({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      price: listing.price,
      currency: listing.currency,
    });
  }
  if (listingFields.status && listingFields.status !== existing.status) {
    await notifyAvailabilityChange(
      { id: listing.id, slug: listing.slug, title: listing.title },
      listingFields.status
    );
  }

  await logAuditEvent({
    actor: listing.publisher.name,
    action: "Listing updated",
    entityType: "Listing",
    entityId: listing.id,
    entityLabel: listing.title,
    previousState: existing,
    newState: listing,
  });

  return NextResponse.json(normalizeListing(listing));
}

/**
 * Soft-delete only, same convention as `Project`/`Publisher` — sets
 * `deletedAt`/`deletedBy` rather than removing the row, so it surfaces in
 * the Super Admin Recycle Bin instead of vanishing without a trace.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;

  const { listingId } = await params;
  const existing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { publisher: true },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  if (gate.user.role !== "admin" && gate.user.publisherId !== existing.publisherId) {
    return NextResponse.json({ error: "You can only delete your own listings." }, { status: 403 });
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: { deletedAt: new Date(), deletedBy: existing.publisher.name },
  });

  await logAuditEvent({
    actor: existing.publisher.name,
    action: "Listing deleted",
    entityType: "Listing",
    entityId: existing.id,
    entityLabel: existing.title,
    previousState: existing,
  });

  return NextResponse.json({ ok: true });
}
