import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { getEntityConfig, RECYCLE_BIN_ENTITY_TYPES } from "@/lib/adminEntities";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const bodySchema = z.object({
  entityType: z.enum(RECYCLE_BIN_ENTITY_TYPES as [string, ...string[]]),
  entityId: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * "Soft Delete by default" for the entity types that had no delete route
 * of their own before this pass (Project, Publisher, User, Listing) —
 * Unit/MapModelVersion/DetailModelVersion already got their existing
 * DELETE routes converted to soft-delete in place; this generic route is
 * reused for all 7 rather than N bespoke near-identical files.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { entityType, entityId, reason } = parsed.data;
  const config = getEntityConfig(entityType);
  if (!config) return NextResponse.json({ error: "Unknown entity type." }, { status: 400 });

  try {
    const existing = await config.findOne(entityId);
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (existing.deletedAt) return NextResponse.json({ error: "Already in the Recycle Bin." }, { status: 409 });

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    const updated = await config.softDelete(entityId, actor);

    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Soft-deleted",
      entityType: config.auditEntityType,
      entityId,
      entityLabel: config.label(existing),
      reason,
      previousState: existing,
      newState: updated,
    });

    return NextResponse.json(updated);
  } catch (err) {
    await logApiError("/api/admin/recycle-bin/soft-delete", err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Soft delete failed." }, { status: 500 });
  }
}
