import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { recordSaleOrRentalIfNewlyCompleted } from "@/lib/transactions";
import { unitStatusForListingStatus } from "@/lib/units";
import { resolveLocation } from "@/lib/locations";

const bodySchema = z.object({
  status: z
    .enum(["draft", "pending", "active", "sold", "rented", "expired", "suspended", "archived", "rejected"])
    .optional(),
  reason: z.string().optional(),
  idleDays: z.number().int().min(0).max(365).optional(),
  premium: z.boolean().optional(),
  transferToPublisherId: z.string().min(1).optional(),
  duplicateOfId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  unitId: z.string().min(1).nullable().optional(),
  neighborhoodId: z.string().min(1).optional(),
});

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

  let projectTarget:
    | { id: string; name: string; neighborhoodId: string; city: string; locationId: string | null; lat: number; lng: number }
    | null = null;
  let clearProject = false;
  if (parsed.data.projectId === null) {
    clearProject = true;
  } else if (parsed.data.projectId) {
    projectTarget = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, deletedAt: null },
      select: { id: true, name: true, neighborhoodId: true, city: true, locationId: true, lat: true, lng: true },
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
    const effectiveProjectId = projectTarget ? projectTarget.id : clearProject ? null : existing.projectId;
    if (effectiveProjectId && unitTarget.projectId !== effectiveProjectId) {
      return NextResponse.json(
        { error: `Unit "${unitTarget.code}" doesn't belong to this listing's project.` },
        { status: 400 }
      );
    }
  }

  if ((projectTarget || clearProject) && parsed.data.unitId === undefined && existing.unitId) {
    const linkedUnit = await prisma.unit.findUnique({
      where: { id: existing.unitId },
      select: { projectId: true },
    });
    const newProjectId = projectTarget ? projectTarget.id : null;
    if (!linkedUnit || linkedUnit.projectId !== newProjectId) {
      clearUnit = true;
    }
  }

  let manualLocation: Awaited<ReturnType<typeof resolveLocation>> = null;
  if (parsed.data.neighborhoodId) {
    const effectiveProjectId = projectTarget ? projectTarget.id : clearProject ? null : existing.projectId;
    if (effectiveProjectId) {
      return NextResponse.json(
        { error: "This listing's location comes from its project — fix the project's location, or detach this listing from it first." },
        { status: 400 }
      );
    }
    manualLocation = await resolveLocation(parsed.data.neighborhoodId);
    if (!manualLocation) {
      return NextResponse.json({ error: `Unknown location "${parsed.data.neighborhoodId}".` }, { status: 400 });
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

      if (projectTarget) {
        await tx.property.update({
          where: { id: row.propertyId },
          data: {
            neighborhoodId: projectTarget.neighborhoodId,
            city: projectTarget.city,
            locationId: projectTarget.locationId,
            lat: projectTarget.lat,
            lng: projectTarget.lng,
            locationConfirmed: true,
          },
        });
      }

      if (manualLocation) {
        await tx.property.update({
          where: { id: row.propertyId },
          data: {
            neighborhoodId: manualLocation.id,
            city: manualLocation.cityName,
            locationId: manualLocation.id,
            lat: manualLocation.lat ?? undefined,
            lng: manualLocation.lng ?? undefined,
            locationConfirmed: true,
          },
        });
      }

      await recordSaleOrRentalIfNewlyCompleted(tx, {
        listingId: row.id,
        previousStatus: existing.status,
        newStatus: row.status,
        transactionType: row.transaction,
        rentSubtype: row.rentSubtype,
        price: row.price,
        currency: row.currency,
      });

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
    if (manualLocation) actions.push(`Listing location fixed → "${manualLocation.officialName}"`);
    if (transferTarget) actions.push(`Listing transferred to publisher "${transferTarget.name}"`);
    if (duplicateTargetId !== undefined) {
      actions.push(duplicateTargetId ? `Listing marked duplicate of ${duplicateTargetId}` : "Listing duplicate flag cleared");
    }
    if (projectTarget) {
      actions.push(`Listing attached to project "${projectTarget.name}"`);
      actions.push(`Listing location synced to project "${projectTarget.name}"`);
    }
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
