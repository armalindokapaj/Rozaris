import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

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
  if (!existing || existing.projectId !== projectId) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const unit = await prisma.unit.update({ where: { id: unitId }, data: parsed.data });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Unit updated",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: unit.code,
  });

  return NextResponse.json(unit);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; unitId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, unitId } = await params;
  const existing = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!existing || existing.projectId !== projectId) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  await prisma.unit.delete({ where: { id: unitId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Unit deleted",
    entityType: "Unit",
    entityId: unitId,
    entityLabel: existing.code,
  });

  return NextResponse.json({ ok: true });
}
