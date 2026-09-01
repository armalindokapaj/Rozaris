import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/adminAuth";
import { getEntityConfig, RECYCLE_BIN_ENTITY_TYPES } from "@/lib/adminEntities";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const bodySchema = z.object({
  entityType: z.enum(RECYCLE_BIN_ENTITY_TYPES as [string, ...string[]]),
  entityId: z.string().min(1),
  confirm: z.string().min(1),
  reason: z.string().min(1, "A reason is required for a hard delete."),
});

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { entityType, entityId, confirm, reason } = parsed.data;
  const config = getEntityConfig(entityType);
  if (!config) return NextResponse.json({ error: "Unknown entity type." }, { status: 400 });

  const existing = await config.findOne(entityId);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!existing.deletedAt) {
    return NextResponse.json(
      { error: "Soft-delete this first — hard delete only removes rows already in the Recycle Bin." },
      { status: 409 }
    );
  }
  if (confirm.trim() !== config.confirmValue(existing)) {
    return NextResponse.json(
      { error: `Confirmation text didn't match. Expected "${config.confirmValue(existing)}".` },
      { status: 422 }
    );
  }

  try {
    await config.hardDelete(entityId, existing);

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Hard deleted",
      entityType: config.auditEntityType,
      entityId,
      entityLabel: config.label(existing),
      reason,
      previousState: existing,
      hardDeleted: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await logApiError("/api/admin/recycle-bin/hard-delete", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Hard delete failed." }, { status: 500 });
  }
}
