import { prisma } from "@/lib/db";

export async function logAuditEvent(event: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  actorId?: string;
  actorRole?: string;
  reason?: string;
  previousState?: unknown;
  newState?: unknown;
  metadata?: unknown;
  ip?: string;
  hardDeleted?: boolean;
}) {
  await prisma.auditLog.create({
    data: {
      actor: event.actor,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      entityLabel: event.entityLabel,
      actorId: event.actorId,
      actorRole: event.actorRole,
      reason: event.reason,
      previousState: event.previousState === undefined ? undefined : (event.previousState as object),
      newState: event.newState === undefined ? undefined : (event.newState as object),
      metadata: event.metadata === undefined ? undefined : (event.metadata as object),
      ip: event.ip,
      hardDeleted: event.hardDeleted ?? false,
    },
  });
}

export function diffState(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { field: string; before: unknown; after: unknown }[] {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changes: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of keys) {
    const b = beforeObj[key];
    const a = afterObj[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push({ field: key, before: b, after: a });
    }
  }
  return changes.sort((x, y) => x.field.localeCompare(y.field));
}
