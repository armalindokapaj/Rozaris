import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const bodySchema = z.object({
  status: z.enum(["pending", "active", "sold", "rented", "expired", "suspended", "archived"]),
  reason: z.string().optional(),
});

/**
 * "Force unpublish/republish" for Listing — `suspended` already existed in
 * `ListingStatus`, just never driven by an admin route (no route has ever
 * written a real Listing row at all yet — see the schema-header note; this
 * route is real and forward-compatible, just legitimately unreachable
 * against live data until the publisher-submission pipeline creates real
 * rows). `suspended` transitions require a reason per PRD §14.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { listingId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.status === "suspended" && !parsed.data.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required to suspend a listing." }, { status: 400 });
  }

  const existing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  try {
    const updated = await prisma.listing.update({
      where: { id: listingId },
      data: { status: parsed.data.status },
    });

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action:
        parsed.data.status === "suspended"
          ? "Listing force-suspended"
          : `Listing status → ${parsed.data.status}`,
      entityType: "Listing",
      entityId: listingId,
      entityLabel: existing.title,
      reason: parsed.data.reason,
      previousState: existing,
      newState: updated,
    });

    return NextResponse.json(updated);
  } catch (err) {
    await logApiError(`/api/admin/listings/${listingId}/publication`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
