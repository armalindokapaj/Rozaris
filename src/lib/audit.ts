import { prisma } from "@/lib/db";

/**
 * Real, Postgres-backed audit trail for the versioned 3D pipeline
 * (PRD_Admin_Mapbox_GLB §26, PRD_Admin_3D_Project_Experience §45) — every
 * write route in src/app/api/map-models and src/app/api/detail-models calls
 * this after a successful upload/publish/rollback/discard. Deliberately
 * separate from the Dashboard-Architecture pass's session-local Zustand
 * `auditLog` slice (src/lib/store.ts) — that one has no real backend
 * actions to log against yet.
 */
export async function logAuditEvent(event: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
}) {
  await prisma.auditLog.create({
    data: {
      actor: event.actor,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      entityLabel: event.entityLabel,
    },
  });
}
