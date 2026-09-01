import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

function findOrphans<T extends { [k: string]: unknown }>(
  rows: T[],
  parentIdKey: keyof T,
  validIds: Set<string>
): T[] {
  return rows.filter((r) => !validIds.has(String(r[parentIdKey])));
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [projectIds, publisherIds, unitIds] = await Promise.all([
    prisma.project.findMany({ select: { id: true } }).then((r) => new Set(r.map((p) => p.id))),
    prisma.publisher.findMany({ select: { id: true } }).then((r) => new Set(r.map((p) => p.id))),
    prisma.unit.findMany({ select: { id: true } }).then((r) => new Set(r.map((u) => u.id))),
  ]);

  const [
    unitGroups,
    unitMeshLinksV1,
    unitMeshLinksV2,
    project3DConfigs,
    mapModels,
    detailModels,
    projectMapModelsLegacy,
    projectDetailModelsLegacy,
    listings,
    projects,
  ] = await Promise.all([
    prisma.unit.groupBy({
      by: ["projectId", "code"],
      where: { deletedAt: null },
      _count: { code: true },
      having: { code: { _count: { gt: 1 } } },
    }),
    prisma.unitMeshLink.findMany({ select: { id: true, projectId: true, meshName: true, unitId: true } }),
    prisma.unitMeshLinkV2.findMany({
      select: { id: true, detailModelVersionId: true, meshName: true, unitId: true },
    }),
    prisma.project3DConfig.findMany({ select: { projectId: true } }),
    prisma.mapModelVersion.findMany({ select: { id: true, projectId: true, version: true } }),
    prisma.detailModelVersion.findMany({ select: { id: true, projectId: true, version: true } }),
    prisma.projectMapModel.findMany({ select: { projectId: true } }),
    prisma.projectDetailModel.findMany({ select: { projectId: true } }),
    prisma.listing.findMany({ where: { deletedAt: null }, select: { id: true, title: true, publisherId: true } }),
    prisma.project.findMany({ where: { deletedAt: null }, select: { id: true, name: true, publisherId: true } }),
  ]);

  const brokenUnitMeshLinksV1 = unitMeshLinksV1.filter((l) => !unitIds.has(l.unitId));
  const brokenUnitMeshLinksV2 = unitMeshLinksV2.filter((l) => !unitIds.has(l.unitId));

  return NextResponse.json({
    duplicateUnitCodes: unitGroups.map((g) => ({
      projectId: g.projectId,
      code: g.code,
      count: g._count.code,
    })),
    brokenUnitMeshLinks: {
      legacy: brokenUnitMeshLinksV1,
      v2: brokenUnitMeshLinksV2,
    },
    orphanedRows: {
      project3DConfigs: findOrphans(project3DConfigs, "projectId", projectIds),
      mapModelVersions: findOrphans(mapModels, "projectId", projectIds),
      detailModelVersions: findOrphans(detailModels, "projectId", projectIds),
      projectMapModelsLegacy: findOrphans(projectMapModelsLegacy, "projectId", projectIds),
      projectDetailModelsLegacy: findOrphans(projectDetailModelsLegacy, "projectId", projectIds),
    },
    missingDeveloperRelationships: {
      listingsMissingPublisher: listings.filter((l) => !publisherIds.has(l.publisherId)),
      projectsMissingPublisher: projects.filter((p) => !publisherIds.has(p.publisherId)),
    },
  });
}
