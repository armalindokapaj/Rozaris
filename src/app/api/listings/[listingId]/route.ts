import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { normalizeListing } from "@/lib/listings";
import { requirePublisherSession } from "@/lib/publisherAuth";

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
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  descriptionEn: z.string().min(1).optional(),
  descriptionSq: z.string().min(1).optional(),
  status: z.enum(["active", "sold", "rented", "expired", "suspended", "archived"]).optional(),
  premium: z.boolean().optional(),
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

  const existing = await prisma.listing.findUnique({ where: { id: listingId } });
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

  const listing = await prisma.listing.update({
    where: { id: listingId },
    data: parsed.data,
    include: { publisher: true },
  });

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
