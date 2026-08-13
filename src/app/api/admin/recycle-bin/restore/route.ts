import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { getEntityConfig, RECYCLE_BIN_ENTITY_TYPES } from "@/lib/adminEntities";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const bodySchema = z.object({
  entityType: z.enum(RECYCLE_BIN_ENTITY_TYPES as [string, ...string[]]),
  entityId: z.string().min(1),
});

/** Restore one soft-deleted row from the Recycle Bin — clears
 * `deletedAt`/`deletedBy`. Any `requireAdmin()`, not just Super Admin:
 * restoring is the low-risk half of soft delete, the same permission level
 * that could soft-delete it in the first place. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { entityType, entityId } = parsed.data;
  const config = getEntityConfig(entityType);
  if (!config) return NextResponse.json({ error: "Unknown entity type." }, { status: 400 });

  try {
    const existing = await config.findOne(entityId);
    if (!existing || !existing.deletedAt) {
      return NextResponse.json({ error: "Not in the Recycle Bin." }, { status: 404 });
    }

    const restored = await config.restore(entityId);

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Restored from Recycle Bin",
      entityType: config.auditEntityType,
      entityId,
      entityLabel: config.label(existing),
      previousState: existing,
      newState: restored,
    });

    return NextResponse.json(restored);
  } catch (err) {
    await logApiError("/api/admin/recycle-bin/restore", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Restore failed." }, { status: 500 });
  }
}
