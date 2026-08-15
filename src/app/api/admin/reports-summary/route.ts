import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Reports tab — every number here is a real Postgres aggregate, replacing
 * four numbers that used to be hardcoded literals ("6.2h", "100%", "3",
 * "99.98%") with nothing behind them. `avgApprovalHours`/`errorCount` can
 * legitimately read "no data yet" right after the platform's content wipe
 * (see the "Rozaris Platform Audit" memory) — that's honest, not a bug.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [pendingListings, pendingProjects, pendingPublishers, reviewedListings, reviewedProjects, duplicateFlags, apiErrors24h] =
    await Promise.all([
      prisma.listing.count({ where: { status: "pending", deletedAt: null } }),
      prisma.project.count({ where: { approvalStatus: "pending", deletedAt: null } }),
      prisma.publisher.count({ where: { verified: false, restricted: false, deletedAt: null } }),
      prisma.listing.findMany({
        where: { reviewedAt: { not: null } },
        select: { createdAt: true, reviewedAt: true },
      }),
      prisma.project.findMany({
        where: { reviewedAt: { not: null } },
        select: { createdAt: true, reviewedAt: true },
      }),
      prisma.listing.count({ where: { duplicateOfId: { not: null }, deletedAt: null } }),
      prisma.apiErrorLog.count({ where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);

  const decisionHours = [...reviewedListings, ...reviewedProjects].map(
    (r) => (r.reviewedAt!.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000)
  );
  const avgApprovalHours =
    decisionHours.length > 0 ? decisionHours.reduce((a, b) => a + b, 0) / decisionHours.length : null;

  return NextResponse.json({
    pendingApprovals: pendingListings + pendingProjects + pendingPublishers,
    avgApprovalHours,
    decisionsRecorded: decisionHours.length,
    duplicateFlags,
    apiErrors24h,
  });
}
