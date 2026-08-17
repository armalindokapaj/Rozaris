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

  const unit = await prisma.unit.update({ where: { id: unitId }, data: parsed.data });
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
    previousState: existing,
  });

  return NextResponse.json({ ok: true });
}
