import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeProject } from "@/lib/projects";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      publisher: true,
      units: { where: { deletedAt: null }, orderBy: { code: "asc" } },
      constructionStages: { orderBy: { order: "asc" } },
    },
  });
  if (!row || row.deletedAt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [listingCount, leadCount, memberCount, publishTargetCount, inventoryState, mapModel, slots, config] =
    await Promise.all([
      prisma.listing.count({ where: { projectId, deletedAt: null } }),
      prisma.leadItem.count({ where: { projectId } }),
      prisma.projectMembership.count({ where: { projectId } }),
      prisma.projectPublishTarget.count({ where: { projectId } }),
      prisma.projectInventoryState.findUnique({ where: { projectId } }),
      prisma.mapModelVersion.findFirst({
        where: { projectId, deletedAt: null, publicationStatus: { not: "archived" } },
        orderBy: { version: "desc" },
      }),
      prisma.detailModelSlot.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
        include: {
          versions: {
            where: { deletedAt: null },
            orderBy: { version: "desc" },
            select: { id: true, version: true, publicationStatus: true, fileName: true, updatedAt: true },
          },
        },
      }),
      prisma.project3DConfig.findUnique({ where: { projectId }, select: { projectId: true, updatedAt: true } }),
    ]);

  return NextResponse.json({
    project: normalizeProject(row),
    approvalStatus: row.approvalStatus,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    idleUntil: row.idleUntil,
    idleReason: row.idleReason,
    locationId: row.locationId,
    counts: {
      units: row.units.length,
      listings: listingCount,
      leads: leadCount,
      members: memberCount,
      publishTargets: publishTargetCount,
    },
    inventoryRevision: inventoryState ? inventoryState.revision.toString() : null,
    threeD: {
      hasMapModel: Boolean(mapModel),
      mapModelEnabled: mapModel?.publicationStatus === "published",
      mapModelPosition: mapModel ? { lat: mapModel.latitude, lng: mapModel.longitude } : null,
      hasConfig: Boolean(config),
      slots: slots.map((slot) => ({
        id: slot.id,
        name: slot.name,
        role: slot.role,
        versionCount: slot.versions.length,
        latestVersion: slot.versions[0]?.version ?? null,
        publishedVersion: slot.versions.find((v) => v.publicationStatus === "published")?.version ?? null,
        updatedAt: slot.versions[0]?.updatedAt ?? null,
      })),
    },
  });
}
