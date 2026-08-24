import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { parseSheetRef } from "@/lib/integrations/googleSheets";
import { SYNCABLE_FIELDS } from "@/lib/integrations/normalization";

const patchConnectorSchema = z.object({
  status: z.enum(["active", "paused", "error"]).optional(),
  /** Repoint the connector at a different sheet (or a different tab of
   * the same workbook) — the whole URL, same as create. */
  sheetUrl: z.string().min(1).optional(),
  externalResourceId: z.string().min(1).nullable().optional(),
  /** Replaces the stored mapping wholesale; `{}` clears every override
   * and falls back to the built-in header aliases. */
  columnMapping: z.record(z.string(), z.enum(SYNCABLE_FIELDS)).optional(),
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

  const data: Prisma.InventoryConnectorUpdateInput = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.columnMapping) data.columnMapping = parsed.data.columnMapping as Prisma.InputJsonValue;

  if (parsed.data.sheetUrl !== undefined) {
    const ref = parseSheetRef(parsed.data.sheetUrl);
    if (!ref) {
      return NextResponse.json(
        { error: "That doesn't look like a Google Sheets link. Copy the URL from the sheet's address bar (docs.google.com/spreadsheets/d/…)." },
        { status: 400 }
      );
    }
    data.externalResourceId = ref.sheetId;
    data.configuration = { ...(existing.configuration as Record<string, unknown> | null), gid: ref.gid } as Prisma.InputJsonValue;
    // Repointing at a different sheet clears a previous failure — the
    // stored `error` state described the OLD sheet.
    if (existing.status === "error" && !parsed.data.status) data.status = "active";
  } else if (parsed.data.externalResourceId !== undefined) {
    data.externalResourceId = parsed.data.externalResourceId;
  }

  const updated = await prisma.inventoryConnector.update({ where: { id: connectorId }, data });

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
