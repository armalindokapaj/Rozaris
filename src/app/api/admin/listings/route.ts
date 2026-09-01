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

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const requested = new URL(request.url).searchParams.get("status") ?? "pending";

  if (requested === "all") {
    const rows = await prisma.listing.findMany({
      where: { deletedAt: null },
      include: { publisher: true, property: true, unit: { select: { code: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      rows.map((r) => ({
        ...normalizeListing(r),
        idleUntil: r.idleUntil,
        idleReason: r.idleReason,
        lastRenewedAt: r.lastRenewedAt,
        locationConfirmed: r.property.locationConfirmed,
        duplicateOfId: r.duplicateOfId,
        projectId: r.projectId,
        unitId: r.unitId,
        unitCode: r.unit?.code ?? null,
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
