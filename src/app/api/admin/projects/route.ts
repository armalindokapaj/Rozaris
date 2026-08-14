import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeProject } from "@/lib/projects";

/**
 * Feeds the Admin console's 3D Platform project grid (`Project3DGrid`,
 * `src/app/admin/page.tsx`) — every non-hard-deleted project regardless of
 * `approvalStatus` (pending/active/archived all included), unlike the
 * public `GET /api/projects` (active-only). Admin needs to see and manage
 * a pending or admin-archived project too, not just what's publicly live —
 * same reasoning `GET /api/admin/listings` documents for its own `status`
 * param, except this grid always wants every status at once rather than
 * one at a time (it overlays per-card visibility state from
 * `GET /api/admin/projects/[id]/publication` on top of this base list).
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      publisher: true,
      units: { where: { deletedAt: null } },
      constructionStages: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rows.map(normalizeProject));
}
