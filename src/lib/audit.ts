import { prisma } from "@/lib/db";

/**
 * Real, Postgres-backed audit trail for the versioned 3D pipeline
 * (PRD_Admin_Mapbox_GLB §26, PRD_Admin_3D_Project_Experience §45) — every
 * write route in src/app/api/map-models and src/app/api/detail-models calls
 * this after a successful upload/publish/rollback/discard. Deliberately
 * separate from the Dashboard-Architecture pass's session-local Zustand
 * `auditLog` slice (src/lib/store.ts) — that one has no real backend
 * actions to log against yet.
 *
 * Super Admin control/audit pass — widened additively (every new field is
 * optional) so the ~15 pre-existing call sites above keep compiling and
 * behaving exactly as before. The new fields turn this same table into the
 * platform's version-history source too: any row that carries
 * `previousState`/`newState` is a restorable version, read back by
 * `/api/admin/entities/[entityType]/[entityId]/restore-version`. Callers
 * that want field-level restore or a before/after diff should pass whole
 * plain-object snapshots (not just the changed keys) for both states —
 * `diffState()` below computes the changed-key set from them.
 */
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
      // Prisma's Json columns reject `undefined` (only `null` or a real
      // JSON value) — normalize so passing `previousState: undefined`
      // doesn't throw.
      previousState: event.previousState === undefined ? undefined : (event.previousState as object),
      newState: event.newState === undefined ? undefined : (event.newState as object),
      metadata: event.metadata === undefined ? undefined : (event.metadata as object),
      ip: event.ip,
      hardDeleted: event.hardDeleted ?? false,
    },
  });
}

/** Field-by-field diff between two plain-object snapshots — the shared
 * shape `BeforeAfterDiff.tsx` and the field-level restore route both build
 * on. Keys present in only one side count as added/removed; deep-equal
 * (via JSON.stringify — every snapshot here is JSON-serializable Prisma
 * row data, never functions/Dates-as-objects/etc.) values are omitted. */
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
