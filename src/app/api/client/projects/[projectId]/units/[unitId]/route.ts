import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions/projectAccess";
import { logAuditEvent } from "@/lib/audit";
import { bumpInventoryRevision } from "@/lib/publishing/inventoryRevision";

const clientUnitPatchSchema = z.object({
  price: z.number().positive().optional(),
  status: z.enum(["available", "reserved", "sold"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; unitId: string }> }
) {
  const { projectId, unitId } = await params;
  const gate = await requireProjectPermission(projectId, "inventory:update");
  if (gate instanceof NextResponse) return gate;

  const parsed = clientUnitPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!existing || existing.projectId !== projectId || existing.deletedAt) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const unit = await prisma.unit.update({ where: { id: unitId }, data: parsed.data });
  await bumpInventoryRevision(projectId);

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "client",
    actorId: gate.user?.id,
    actorRole: "client_portal",
    action: "Unit updated (client portal)",
    entityType: "Unit",
    entityId: unit.id,
    entityLabel: unit.code,
    previousState: existing,
    newState: unit,
  });

  return NextResponse.json(unit);
}
