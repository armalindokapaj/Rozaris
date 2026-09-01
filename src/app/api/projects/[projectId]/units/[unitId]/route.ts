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
  orientation: z.enum(["N", "E", "S", "W"]).nullish(),
});

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

  let unit;
  try {
    unit = await prisma.unit.update({ where: { id: unitId }, data: parsed.data });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      return NextResponse.json(
        { error: `Another unit in this project already uses the code "${parsed.data.code}".` },
        { status: 409 }
      );
    }
    throw err;
  }
  await bumpInventoryRevision(projectId);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Unit updated",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: unit.code,
    metadata: { projectId },
    previousState: existing,
    newState: unit,
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
  if (!existing || existing.projectId !== projectId || existing.deletedAt) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await prisma.unit.update({
    where: { id: unitId },
    data: { deletedAt: new Date(), deletedBy: actor },
  });
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
