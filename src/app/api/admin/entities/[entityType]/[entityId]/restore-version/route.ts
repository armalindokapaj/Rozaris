import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getEntityConfig, PROJECT_3D_CONFIG_ENTITY } from "@/lib/adminEntities";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const bodySchema = z.object({
  auditLogId: z.string().min(1),
  fields: z.array(z.string()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { entityType, entityId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { auditLogId, fields } = parsed.data;

  const isConfig = entityType === "project3DConfig";
  const config = isConfig ? null : getEntityConfig(entityType);
  if (!isConfig && !config) {
    return NextResponse.json({ error: "This entity type has no restorable fields." }, { status: 400 });
  }
  const auditEntityType = isConfig ? PROJECT_3D_CONFIG_ENTITY.auditEntityType : config!.auditEntityType;

  const versionRow = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!versionRow || versionRow.entityType !== auditEntityType || versionRow.entityId !== entityId) {
    return NextResponse.json({ error: "That version doesn't belong to this entity." }, { status: 404 });
  }
  const sourceState = (versionRow.newState ?? versionRow.previousState) as Record<string, unknown> | null;
  if (!sourceState) {
    return NextResponse.json({ error: "That audit entry has no captured state to restore." }, { status: 422 });
  }
  const restoreState = fields
    ? Object.fromEntries(fields.filter((f) => f in sourceState).map((f) => [f, sourceState[f]]))
    : sourceState;

  try {
    const beforeRestore = isConfig
      ? await PROJECT_3D_CONFIG_ENTITY.findOne(entityId)
      : await config!.findOne(entityId);
    if (!beforeRestore) return NextResponse.json({ error: "Entity not found." }, { status: 404 });

    const restored = isConfig
      ? await PROJECT_3D_CONFIG_ENTITY.applyState(entityId, restoreState)
      : await config!.applyState(entityId, restoreState);

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: fields?.length ? `Restored field(s): ${fields.join(", ")}` : "Restored version",
      entityType: auditEntityType,
      entityId,
      entityLabel: isConfig ? entityId : config!.label(beforeRestore),
      previousState: beforeRestore,
      newState: restored,
      metadata: { restoredFromAuditLogId: auditLogId, fields: fields ?? null },
    });

    return NextResponse.json(restored);
  } catch (err) {
    await logApiError(`/api/admin/entities/${entityType}/restore-version`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Restore failed." }, { status: 500 });
  }
}
