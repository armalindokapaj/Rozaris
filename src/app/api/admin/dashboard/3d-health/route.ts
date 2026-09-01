import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getMissingBindingsProjects } from "@/lib/admin3dHealth";

const STUCK_DRAFT_DAYS = 14;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const stuckSince = new Date(Date.now() - STUCK_DRAFT_DAYS * 24 * 60 * 60 * 1000);

  const [
    mapGlbsLive,
    detailGlbsLive,
    experiencesDraft,
    experiencesPublished,
    blockedMapCount,
    blockedDetailCount,
    warningMapCount,
    warningDetailCount,
    stuckMapDrafts,
    stuckDetailDrafts,
    missingBindingsProjects,
  ] = await Promise.all([
    prisma.mapModelVersion.count({ where: { publicationStatus: "published", deletedAt: null } }),
    prisma.detailModelVersion.count({ where: { publicationStatus: "published", deletedAt: null } }),
    prisma.project3DConfig.count({ where: { status: "draft" } }),
    prisma.project3DConfig.count({ where: { status: "published" } }),
    prisma.mapModelVersion.count({ where: { validationStatus: "blocked", deletedAt: null } }),
    prisma.detailModelVersion.count({ where: { validationStatus: "blocked", deletedAt: null } }),
    prisma.mapModelVersion.count({ where: { validationStatus: "warning", deletedAt: null } }),
    prisma.detailModelVersion.count({ where: { validationStatus: "warning", deletedAt: null } }),
    prisma.mapModelVersion.count({ where: { publicationStatus: "draft", deletedAt: null, createdAt: { lt: stuckSince } } }),
    prisma.detailModelVersion.count({ where: { publicationStatus: "draft", deletedAt: null, createdAt: { lt: stuckSince } } }),
    getMissingBindingsProjects(),
  ]);

  return NextResponse.json({
    mapGlbsLive,
    detailGlbsLive,
    experiencesDraft,
    experiencesPublished,
    failedUploads: blockedMapCount + blockedDetailCount,
    performanceWarnings: warningMapCount + warningDetailCount,
    stuckDrafts: stuckMapDrafts + stuckDetailDrafts,
    missingBindings: {
      projectCount: missingBindingsProjects.length,
      projects: missingBindingsProjects.slice(0, 8),
    },
    sectionErrors: null,
  });
}
