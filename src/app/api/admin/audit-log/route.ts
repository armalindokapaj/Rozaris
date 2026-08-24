import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Global Audit Log — real, paginated, filterable read of `AuditLog`
 * (`admin_audit_log`), replacing `AuditLogTab.tsx`'s previous session-local
 * Zustand mock. Query params: `entityType`, `actor`, `action` (all
 * substring/exact-match filters), `from`/`to` (ISO date bounds on
 * `createdAt`), `cursor`/`limit` (id-based pagination, newest first).
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  /** Everything that happened to one project — its own rows PLUS the rows
   * written against its children (units, inventory connectors, publish
   * targets), which carry a different `entityId` but stamp `projectId`
   * into `metadata`. The Project Manager's Activity tab is the caller;
   * without this it could only ever show project-level edits and would
   * silently omit "who repriced A-044". */
  const projectId = url.searchParams.get("projectId");
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (projectId) {
    where.OR = [
      { entityType: "Project", entityId: projectId },
      { metadata: { path: ["projectId"], equals: projectId } },
    ];
  }
  if (actor) where.actor = { contains: actor, mode: "insensitive" };
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
}
