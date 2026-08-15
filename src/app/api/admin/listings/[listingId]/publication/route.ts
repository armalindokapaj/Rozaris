import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { recordSaleOrRentalIfNewlyCompleted } from "@/lib/transactions";

const bodySchema = z.object({
  status: z
    .enum(["draft", "pending", "active", "sold", "rented", "expired", "suspended", "archived", "rejected"])
    .optional(),
  reason: z.string().optional(),
  /// Admin taking THIS listing offline for N days — `Listing.idleUntil`
  /// (see the "Rozaris Platform Audit" memory), independent of `status`.
  /// `0` clears an existing idle window early.
  idleDays: z.number().int().min(0).max(365).optional(),
  /// Listings Control's "Feature listing / Premium placement" toggle —
  /// `Listing.premium` already existed in the schema, just had no admin
  /// write path.
  premium: z.boolean().optional(),
  /// Listings Control's "Transfer ownership" — moves the listing to a
  /// different real Publisher. Named distinctly from the route's own
  /// `listingId` param to avoid any confusion about which id is which.
  transferToPublisherId: z.string().min(1).optional(),
  /// Listings Control's "Mark duplicate" — a real (id or slug) pointer to
  /// another listing, resolved server-side below. `null` clears it.
  duplicateOfId: z.string().min(1).nullable().optional(),
});

/**
 * "Force unpublish/republish" for Listing — `suspended` already existed in
 * `ListingStatus`, just never driven by an admin route. `suspended`
 * transitions require a reason per PRD §14. `status: "active"` (or
 * "pending") from a `draft` listing is also how an admin exercises the
 * "location drop" rule's one exception — approving a listing that never
 * got a confirmed location.
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
  if (parsed.data.idleDays != null && parsed.data.idleDays > 0 && !parsed.data.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required to take a listing offline." }, { status: 400 });
  }

  const existing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  let transferTarget: { id: string; name: string } | null = null;
  if (parsed.data.transferToPublisherId) {
    transferTarget = await prisma.publisher.findFirst({
      where: { id: parsed.data.transferToPublisherId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!transferTarget) {
      return NextResponse.json({ error: "Target publisher not found." }, { status: 400 });
    }
  }

  let duplicateTargetId: string | null | undefined = undefined;
  if (parsed.data.duplicateOfId === null) {
    duplicateTargetId = null;
  } else if (parsed.data.duplicateOfId) {
    const target = await prisma.listing.findFirst({
      where: { OR: [{ id: parsed.data.duplicateOfId }, { slug: parsed.data.duplicateOfId }] },
      select: { id: true },
    });
    if (!target || target.id === listingId) {
      return NextResponse.json({ error: "Target listing (by id or slug) not found." }, { status: 400 });
    }
    duplicateTargetId = target.id;
  }

  try {
    const idleUpdate =
      parsed.data.idleDays == null
        ? {}
        : parsed.data.idleDays === 0
          ? { idleUntil: null, idleReason: null }
          : {
              idleUntil: new Date(Date.now() + parsed.data.idleDays * 24 * 60 * 60 * 1000),
              idleReason: parsed.data.reason,
            };

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.listing.update({
        where: { id: listingId },
        data: {
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          // Real "reviewed" timestamp — was declared in the schema but never
          // written by any route (Reports tab had nothing real to average).
          // Only stamped on an actual status decision, not an idle-window
          // tweak alone.
          ...(parsed.data.status ? { reviewedAt: new Date() } : {}),
          ...idleUpdate,
          ...(parsed.data.premium != null ? { premium: parsed.data.premium } : {}),
          ...(transferTarget ? { publisherId: transferTarget.id } : {}),
          ...(duplicateTargetId !== undefined ? { duplicateOfId: duplicateTargetId } : {}),
        },
      });

      // Real Transaction event — see src/lib/transactions.ts's doc comment.
      await recordSaleOrRentalIfNewlyCompleted(tx, {
        listingId: row.id,
        previousStatus: existing.status,
        newStatus: row.status,
        transactionType: row.transaction,
        rentSubtype: row.rentSubtype,
        price: row.price,
        currency: row.currency,
      });

      return row;
    });

    const actions: string[] = [];
    if (parsed.data.status === "suspended") actions.push("Listing force-suspended");
    else if (parsed.data.status) actions.push(`Listing status → ${parsed.data.status}`);
    if (parsed.data.idleDays != null) {
      actions.push(
        parsed.data.idleDays === 0
          ? "Listing idle window cleared"
          : `Listing set idle for ${parsed.data.idleDays} days`
      );
    }
    if (parsed.data.premium != null) {
      actions.push(parsed.data.premium ? "Listing marked premium/featured" : "Listing premium/featured removed");
    }
    if (transferTarget) actions.push(`Listing transferred to publisher "${transferTarget.name}"`);
    if (duplicateTargetId !== undefined) {
      actions.push(duplicateTargetId ? `Listing marked duplicate of ${duplicateTargetId}` : "Listing duplicate flag cleared");
    }

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    for (const action of actions) {
      await logAuditEvent({
        actor,
        actorId: gate.user?.id,
        action,
        entityType: "Listing",
        entityId: listingId,
        entityLabel: existing.title,
        reason: parsed.data.reason,
        previousState: existing,
        newState: updated,
      });
    }

    return NextResponse.json(updated);
  } catch (err) {
    await logApiError(`/api/admin/listings/${listingId}/publication`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
