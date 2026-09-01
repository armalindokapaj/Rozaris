import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { normalizeListing } from "@/lib/listings";
import { requirePublisherSession } from "@/lib/publisherAuth";
import { recordSaleOrRentalIfNewlyCompleted } from "@/lib/transactions";
import { AMENITY_KEYS } from "@/lib/constants";
import { notifyPriceDrop, notifyAvailabilityChange } from "@/lib/notify";

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  price: z.number().positive().optional(),
  currency: z.enum(["EUR", "ALL"]).optional(),
  negotiable: z.boolean().optional(),
  area: z.number().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  condition: z.enum(["new", "renovated", "good", "needs_renovation"]).optional(),
  amenities: z.array(z.enum(AMENITY_KEYS as [string, ...string[]])).optional(),
  images: z.array(z.string()).optional(),
  descriptionEn: z.string().min(1).optional(),
  descriptionSq: z.string().min(1).optional(),
  status: z.enum(["active", "sold", "rented", "expired", "suspended", "archived"]).optional(),
  premium: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  locationConfirmed: z.boolean().optional(),
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
  if (gate.user.role !== "admin" && (parsed.data.status === "active" || parsed.data.status === "suspended")) {
    return NextResponse.json({ error: "Only an admin can publish or suspend a listing." }, { status: 403 });
  }

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
        ...(existing.status === "draft" && nowConfirmed && !listingFields.status
          ? { status: "pending" as const }
          : {}),
      },
      include: { publisher: true, property: true },
    });

    await recordSaleOrRentalIfNewlyCompleted(tx, {
      listingId: updated.id,
      previousStatus: existing.status,
      newStatus: updated.status,
      transactionType: updated.transaction,
      rentSubtype: updated.rentSubtype,
      price: updated.price,
      currency: updated.currency,
    });

    if (listingFields.price != null && listingFields.price !== existing.price) {
      await tx.priceHistoryEntry.create({
        data: { listingId: updated.id, price: updated.price, currency: updated.currency },
      });
    }

    return updated;
  });

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
