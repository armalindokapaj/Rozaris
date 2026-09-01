import { prisma } from "@/lib/db";

export interface MissingBindingsProject {
  projectId: string;
  projectName: string;
  totalUnits: number;
  linkedUnits: number;
}

export async function getMissingBindingsProjects(): Promise<MissingBindingsProject[]> {
  const publishedVersions = await prisma.detailModelVersion.findMany({
    where: { publicationStatus: "published", deletedAt: null },
    select: {
      projectId: true,
      project: { select: { name: true, deletedAt: true } },
      unitLinks: { select: { unitId: true } },
    },
  });

  const byProject = new Map<string, { projectName: string; linkedUnitIds: Set<string> }>();
  for (const v of publishedVersions) {
    if (v.project?.deletedAt) continue;
    const entry =
      byProject.get(v.projectId) ??
      { projectName: v.project?.name ?? v.projectId, linkedUnitIds: new Set<string>() };
    v.unitLinks.forEach((l) => entry.linkedUnitIds.add(l.unitId));
    byProject.set(v.projectId, entry);
  }

  if (byProject.size === 0) return [];

  const unitCounts = await prisma.unit.groupBy({
    by: ["projectId"],
    where: { projectId: { in: Array.from(byProject.keys()) }, deletedAt: null },
    _count: { _all: true },
  });
  const totalByProject = new Map(unitCounts.map((c) => [c.projectId, c._count._all]));

  const results: MissingBindingsProject[] = [];
  for (const [projectId, { projectName, linkedUnitIds }] of byProject) {
    const totalUnits = totalByProject.get(projectId) ?? 0;
    if (totalUnits > 0 && linkedUnitIds.size < totalUnits) {
      results.push({ projectId, projectName, totalUnits, linkedUnits: linkedUnitIds.size });
    }
  }
  return results;
}
