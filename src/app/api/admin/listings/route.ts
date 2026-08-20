import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeListing } from "@/lib/listings";

const VALID_STATUSES = [
  "draft",
  "pending",
  "active",
  "sold",
  "rented",
  "expired",
  "suspended",
  "archived",
  "rejected",
] as const;
type ListingStatusFilter = (typeof VALID_STATUSES)[number];

/**
 * Feeds both the Admin Queue tab's "listing" review items (thin shape,
 * `?status=pending` default — id/title/publisher name only, unchanged)
 * and the fuller admin Listings management tab (`?status=all` — every
 * real field, any status, for real create/edit/idle management; see the
 * "Rozaris Platform Audit" memory). Approving/rejecting/idling a returned
 * id calls the existing `PATCH /api/admin/listings/[listingId]/publication`
 * route, which this list merely surfaces.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const requested = new URL(request.url).searchParams.get("status") ?? "pending";

  if (requested === "all") {
    const rows = await prisma.listing.findMany({
      where: { deletedAt: null },
      include: { publisher: true, property: true },
      orderBy: { createdAt: "desc" },
    });
    // The admin management table needs a few fields `normalizeListing`
    // deliberately leaves off the public `Listing` shape (idle/staleness
    // are admin-only concerns) — spread them on top rather than widening
    // the public type everyone else consumes. `locationConfirmed` moved
    // onto `Property` in the Property/Listing split (see MEMORY note
    // "rozaris-controlled-taxonomy-spec").
    return NextResponse.json(
      rows.map((r) => ({
        ...normalizeListing(r),
        idleUntil: r.idleUntil,
        idleReason: r.idleReason,
        lastRenewedAt: r.lastRenewedAt,
        locationConfirmed: r.property.locationConfirmed,
        duplicateOfId: r.duplicateOfId,
        // Admin "Projects" console — which Project (if any) this listing is
        // managed under. Same admin-only treatment as the fields above:
        // left off the public `Listing` shape `normalizeListing` returns.
        projectId: r.projectId,
      }))
    );
  }

  const status: ListingStatusFilter = VALID_STATUSES.includes(requested as ListingStatusFilter)
    ? (requested as ListingStatusFilter)
    : "pending";
  const rows = await prisma.listing.findMany({
    where: { status, deletedAt: null },
    include: { publisher: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    rows.map((r) => ({ id: r.id, title: r.title, publisherName: r.publisher.name }))
  );
}
