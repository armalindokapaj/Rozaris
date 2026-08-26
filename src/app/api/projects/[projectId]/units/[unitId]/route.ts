import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { bumpInventoryRevision } from "@/lib/publishing/inventoryRevision";

const unitPatchSchema = z.object({
  code: z.string().min(1).optional(),
  type: z.enum(["residential", "commercial", "parking", "storage"]).optional(),
  buildingName: z.string().min(1).optional(),
  floor: z.number().int().optional(),
  area: z.number().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  price: z.number().positive().optional(),
  currency: z.enum(["EUR", "ALL"]).optional(),
  transaction: z.enum(["sale", "rent", "coming_soon"]).optional(),
  status: z.enum(["available", "reserved", "sold"]).optional(),
  images: z.array(z.string()).optional(),
  floorPlanImage: z.string().optional(),
  facadeImage: z.string().optional(),
  videoUrl: z.string().optional(),
  // See the POST route's schema — `null` clears it, omitting leaves it.
  orientation: z.enum(["N", "E", "S", "W"]).nullish(),
});

/** Phase 3 — see `../route.ts`'s doc comment for the full write-path
 * context. PATCH/DELETE for one unit, mirroring the same
 * `requireAdmin()`-gated, audit-logged pattern as every other admin-write
 * route in this app (e.g. `src/app/api/platform-hdri/[id]/route.ts`). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; unitId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, unitId } = await params;
  const parsed = unitPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!existing || existing.projectId !== projectId || existing.deletedAt) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  // `@@unique([projectId, code])`: renaming a unit onto a code another unit
  // already holds is a normal thing to attempt (it is one keystroke in the
  // Sheet Sync grid's UNIT column, and `code` is the key the Google Sheets
  // connector matches on), so it has to come back as a readable 409 rather
  // than as the unhandled P2002 -> opaque 500 it used to be.
  let unit;
  try {
    unit = await prisma.unit.update({ where: { id: unitId }, data: parsed.data });
  } catch (err) {
    // Matched on the error's own `code` rather than
    // `instanceof Prisma.PrismaClientKnownRequestError`: `src/lib/db.ts`
    // caches the client on `globalThis` across hot reloads, so in dev the
    // thrown error routinely comes from an EARLIER evaluation of the
    // generated client than the one this module imported, and `instanceof`
    // silently returns false — turning this back into the opaque 500 it is
    // here to remove. Verified against a real duplicate.
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      return NextResponse.json(
        { error: `Another unit in this project already uses the code "${parsed.data.code}".` },
        { status: 409 }
      );
    }
    throw err;
  }
  // Multi-Channel Publishing PRD Phase 6 — see inventoryRevision.ts's doc
  // comment. Unconditional even for edits that don't touch price/status
  // (e.g. a floor plan image) — simpler and safe than trying to allowlist
  // exactly which PATCH fields the public DTO actually surfaces.
  await bumpInventoryRevision(projectId);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Unit updated",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: unit.code,
    // `projectId` in metadata is what makes this edit visible in the
    // project's Activity tab: `/api/admin/audit-log?projectId=` matches on
    // `entityType:"Project"` OR `metadata.projectId`, and a Unit row is
    // neither unless it says so. Without it every hand edit — including
    // every cell of the Sheet Sync grid — was audited into a log nothing
    // in the Project Manager could surface.
    metadata: { projectId },
    previousState: existing,
    newState: unit,
  });

  return NextResponse.json(unit);
}

/**
 * Soft-deletes a unit — Super Admin control/audit pass, no longer a real
 * `prisma.unit.delete()`. Restorable from the Recycle Bin; permanently
 * gone only via a Super Admin hard-delete.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; unitId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, unitId } = await params;
  const existing = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!existing || existing.projectId !== projectId || existing.deletedAt) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await prisma.unit.update({
    where: { id: unitId },
    data: { deletedAt: new Date(), deletedBy: actor },
  });
  // Multi-Channel Publishing PRD Phase 6 — a deleted unit must disappear
  // from the public inventory endpoint too.
  await bumpInventoryRevision(projectId);

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Unit soft-deleted",
    entityType: "Unit",
    entityId: unitId,
    entityLabel: existing.code,
    metadata: { projectId },
    previousState: existing,
  });

  return NextResponse.json({ ok: true });
}
