import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

const VALID_STATUSES = ["pending", "active", "sold", "rented", "expired", "suspended", "archived"] as const;
type ListingStatusFilter = (typeof VALID_STATUSES)[number];

/**
 * Feeds the Admin Queue tab's "listing" review items (`src/app/admin/page.tsx`)
 * — the first real consumer of `ListingStatus.pending` rows, now that
 * `POST /api/listings` actually creates them (T0 of the platform audit's
 * roadmap; see the "Rozaris Platform Audit" memory). Deliberately thin
 * (id/title/publisher name only) since the queue card doesn't need the
 * full listing. Approving/rejecting a returned id calls the existing
 * `PATCH /api/admin/listings/[listingId]/publication` route, which this
 * list merely surfaces.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const requested = new URL(request.url).searchParams.get("status") ?? "pending";
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
