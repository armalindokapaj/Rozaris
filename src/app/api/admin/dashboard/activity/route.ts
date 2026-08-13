import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * PRD_ROZARIS_Admin_Dashboard §6.4 "Platform Activity" — a compact recent
 * slice of the real Global Audit Log (`/api/admin/audit-log` is the full,
 * filterable, paginated version this same table backs; this route just
 * takes the newest handful for the Dashboard feed).
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const items = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      actor: true,
      action: true,
      entityType: true,
      entityId: true,
      entityLabel: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}
