import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const patchConnectorSchema = z.object({
  status: z.enum(["active", "paused", "error"]).optional(),
  externalResourceId: z.string().min(1).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { connectorId } = await params;
  const parsed = patchConnectorSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.inventoryConnector.findUnique({ where: { id: connectorId } });
  if (!existing) {
    return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  }

  const updated = await prisma.inventoryConnector.update({ where: { id: connectorId }, data: parsed.data });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Inventory connector updated",
    entityType: "InventoryConnector",
    entityId: connectorId,
    entityLabel: updated.type,
    previousState: existing,
    newState: updated,
    metadata: { projectId: updated.projectId },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { connectorId } = await params;
  const existing = await prisma.inventoryConnector.findUnique({ where: { id: connectorId } });
  if (!existing) {
    return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  }

  await prisma.inventoryConnector.delete({ where: { id: connectorId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Inventory connector deleted",
    entityType: "InventoryConnector",
    entityId: connectorId,
    entityLabel: existing.type,
    previousState: existing,
    metadata: { projectId: existing.projectId },
  });

  return NextResponse.json({ ok: true });
}
