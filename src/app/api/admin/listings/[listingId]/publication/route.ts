import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { recordSaleOrRentalIfNewlyCompleted } from "@/lib/transactions";
import { unitStatusForListingStatus } from "@/lib/units";

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
  /// Projects console — attaches/detaches this listing to/from a Project
  /// (a development). `null` clears it back to a standalone listing.
  projectId: z.string().min(1).nullable().optional(),
  /// "Units & Listings, Untangled" — links/unlinks this listing to a Unit
  /// (the 3D-mapped inventory record). `null` clears it.
  unitId: z.string().min(1).nullable().optional(),
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

  let projectTarget: { id: string; name: string } | null = null;
  let clearProject = false;
  if (parsed.data.projectId === null) {
    clearProject = true;
  } else if (parsed.data.projectId) {
    projectTarget = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!projectTarget) {
      return NextResponse.json({ error: "Target project not found." }, { status: 400 });
    }
  }

  let unitTarget: { id: string; code: string; projectId: string } | null = null;
  let clearUnit = false;
  if (parsed.data.unitId === null) {
    clearUnit = true;
  } else if (parsed.data.unitId) {
    unitTarget = await prisma.unit.findFirst({
      where: { id: parsed.data.unitId, deletedAt: null },
      select: { id: true, code: true, projectId: true },
    });
    if (!unitTarget) {
      return NextResponse.json({ error: "Target unit not found." }, { status: 400 });
    }
    // A Unit belongs to exactly one Project (required column) — linking a
    // listing to a unit under a DIFFERENT project than the one it's
    // itself attached to would be a silent, confusing mismatch. Checked
    // against whatever this same request leaves the listing's project as,
    // not just its pre-existing one, so patching both fields together
    // (the common case — creating from inside a project) is consistent.
    const effectiveProjectId = projectTarget ? projectTarget.id : clearProject ? null : existing.projectId;
    if (effectiveProjectId && unitTarget.projectId !== effectiveProjectId) {
      return NextResponse.json(
        { error: `Unit "${unitTarget.code}" doesn't belong to this listing's project.` },
        { status: 400 }
      );
    }
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
          ...(projectTarget ? { projectId: projectTarget.id } : {}),
          ...(clearProject ? { projectId: null } : {}),
          ...(unitTarget ? { unitId: unitTarget.id } : {}),
          ...(clearUnit ? { unitId: null } : {}),
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

      // "Units & Listings, Untangled" — one-way status push onto the
      // linked Unit (see unitStatusForListingStatus's own doc comment for
      // why this direction only). Only on an actual status write, and
      // only when a Unit is linked after this same update.
      if (parsed.data.status && row.unitId) {
        const mapped = unitStatusForListingStatus(row.status);
        if (mapped) {
          await tx.unit.update({ where: { id: row.unitId }, data: { status: mapped } });
        }
      }

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
    if (projectTarget) actions.push(`Listing attached to project "${projectTarget.name}"`);
    if (clearProject) actions.push("Listing detached from project");
    if (unitTarget) actions.push(`Listing linked to unit "${unitTarget.code}"`);
    if (clearUnit) actions.push("Listing unlinked from unit");
    if (parsed.data.status && updated.unitId && unitStatusForListingStatus(updated.status)) {
      actions.push(`Linked unit status → ${unitStatusForListingStatus(updated.status)} (from listing status)`);
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
