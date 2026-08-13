import { prisma } from "@/lib/db";

export interface MissingBindingsProject {
  projectId: string;
  projectName: string;
  totalUnits: number;
  linkedUnits: number;
}

/**
 * Cross-checks every project with at least one published DetailModelVersion
 * against its real Unit rows — PRD_ROZARIS_Admin_Dashboard §7 "Missing unit
 * bindings" / the 3D Health "Missing Bindings" state ("Unit blocks exist
 * but are not fully mapped to inventory"). Deliberately project-level, not
 * mesh-level: it flags a project whose published GLB(s) have fewer
 * confirmed Unit links (UnitMeshLinkV2) than it has live Unit rows, without
 * naming which specific unit is unmapped — that detail already lives in
 * the 3D Experience Configurator's own Units panel, this is just the
 * cross-project rollup for the Admin Dashboard.
 *
 * Shared by the Dashboard's Priority Queue and 3D Health routes so both
 * report the exact same numbers instead of two slightly-different queries
 * drifting apart.
 */
export async function getMissingBindingsProjects(): Promise<MissingBindingsProject[]> {
  const publishedVersions = await prisma.detailModelVersion.findMany({
    where: { publicationStatus: "published", deletedAt: null },
    select: {
      projectId: true,
      project: { select: { name: true, deletedAt: true } },
      unitLinks: { select: { unitId: true } },
    },
  });

  // A project can have multiple published slots (Building + Surroundings,
  // etc. — see DetailModelSlot) — union their linked unit ids across slots
  // rather than double-counting or checking only one.
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
