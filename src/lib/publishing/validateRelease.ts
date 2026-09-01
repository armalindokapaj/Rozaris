import { prisma } from "@/lib/db";

export interface ViewerReleaseReadiness {
  ready: boolean;
  blocking: string[];
  warnings: string[];
}

export async function validateViewerRelease(projectId: string): Promise<ViewerReleaseReadiness> {
  const blocking: string[] = [];
  const warnings: string[] = [];

  const [config, slots] = await Promise.all([
    prisma.project3DConfig.findUnique({ where: { projectId } }),
    prisma.detailModelSlot.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        versions: {
          where: { publicationStatus: "published", deletedAt: null },
          orderBy: { version: "desc" },
          take: 1,
          include: { unitLinks: true },
        },
      },
    }),
  ]);

  if (!config) {
    blocking.push("Project has no 3D Experience configuration yet.");
  }

  if (slots.length === 0) {
    blocking.push("Project has no 3D model slots — nothing to release.");
  }

  let needsReviewCount = 0;
  for (const slot of slots) {
    const published = slot.versions[0];
    if (!published) {
      blocking.push(`Slot "${slot.name}" has no published version.`);
      continue;
    }
    if (published.validationStatus === "blocked") {
      blocking.push(`Slot "${slot.name}"'s published version (v${published.version}) has unresolved validation issues.`);
    } else if (published.validationStatus === "warning") {
      warnings.push(`Slot "${slot.name}"'s published version (v${published.version}) has minor validation warnings.`);
    }
    needsReviewCount += published.unitLinks.filter((l) => l.mappingStatus === "needs_review").length;
  }

  if (needsReviewCount > 0) {
    warnings.push(`${needsReviewCount} unit mesh mapping${needsReviewCount === 1 ? "" : "s"} still need review.`);
  }

  return { ready: blocking.length === 0, blocking, warnings };
}
