import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getEntityConfig, PROJECT_3D_CONFIG_ENTITY } from "@/lib/adminEntities";

/**
 * One entity's current live state + its full AuditLog history — the shared
 * read behind Version History, User Activity, and Before/After. Works for
 * any `entityType` string, not just the 8 Recycle Bin models: `current`
 * resolves to `null` for entity types outside both registries (e.g.
 * `DetailModelSlot`), but `history` still comes back — every
 * `logAuditEvent()` call site in the app already writes a consistent
 * `entityType`/`entityId` pair, so this works retroactively on data logged
 * before this route existed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { entityType, entityId } = await params;

  let current: Record<string, unknown> | null = null;
  let auditEntityType = entityType;
  if (entityType === "project3DConfig") {
    current = await PROJECT_3D_CONFIG_ENTITY.findOne(entityId);
    auditEntityType = PROJECT_3D_CONFIG_ENTITY.auditEntityType;
  } else {
    const config = getEntityConfig(entityType);
    if (config) {
      current = await config.findOne(entityId);
      auditEntityType = config.auditEntityType;
    }
  }

  const history = await prisma.auditLog.findMany({
    where: { entityType: auditEntityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ entityType, entityId, current, history });
}
