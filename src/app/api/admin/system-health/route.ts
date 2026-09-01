import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

const STUCK_DRAFT_DAYS = 14;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const stuckSince = new Date(Date.now() - STUCK_DRAFT_DAYS * 24 * 60 * 60 * 1000);

  const [
    blockedMapModels,
    warningMapModels,
    blockedDetailModels,
    warningDetailModels,
    stuckMapDrafts,
    stuckDetailDrafts,
    recentErrors,
    errorCount24h,
  ] = await Promise.all([
    prisma.mapModelVersion.findMany({
      where: { validationStatus: "blocked", deletedAt: null },
      select: { id: true, projectId: true, version: true, fileName: true, createdAt: true, project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.mapModelVersion.count({ where: { validationStatus: "warning", deletedAt: null } }),
    prisma.detailModelVersion.findMany({
      where: { validationStatus: "blocked", deletedAt: null },
      select: {
        id: true,
        projectId: true,
        slotId: true,
        version: true,
        fileName: true,
        createdAt: true,
        project: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.detailModelVersion.count({ where: { validationStatus: "warning", deletedAt: null } }),
    prisma.mapModelVersion.count({
      where: { publicationStatus: "draft", deletedAt: null, createdAt: { lt: stuckSince } },
    }),
    prisma.detailModelVersion.count({
      where: { publicationStatus: "draft", deletedAt: null, createdAt: { lt: stuckSince } },
    }),
    prisma.apiErrorLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.apiErrorLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);

  return NextResponse.json({
    brokenGlbs: {
      blockedMapModels,
      blockedDetailModels,
      warningMapModelCount: warningMapModels,
      warningDetailModelCount: warningDetailModels,
    },
    stuckDrafts: {
      mapModelCount: stuckMapDrafts,
      detailModelCount: stuckDetailDrafts,
      thresholdDays: STUCK_DRAFT_DAYS,
    },
    apiErrors: {
      last24h: errorCount24h,
      recent: recentErrors,
      forwardOnlyNotice: "Only errors logged after this table was added appear here — no historical backfill.",
    },
  });
}
