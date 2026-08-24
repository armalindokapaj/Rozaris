import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeProject } from "@/lib/projects";

/**
 * One project, everything the Project Manager
 * (`/admin/projects/[projectId]`) needs to open a record — the normalized
 * `Project` (nested publisher/units/stages, same shape the rest of the app
 * consumes) PLUS the admin-only columns the public normalizer deliberately
 * drops (`approvalStatus`, `reviewedAt`, `idleUntil`, `locationId`), the
 * related-record counts the Overview tiles read, and a summary of the 3D
 * pipeline's state.
 *
 * Exists because the Project Manager previously had to pull
 * `GET /api/admin/projects` — EVERY project, with EVERY unit nested — to
 * render one, and had no way to refetch a single record after a save. Also
 * the one place the console can see `approvalStatus` and the 3D slot
 * summary in the same payload, which is what makes the "can this actually
 * go live?" question answerable without four separate requests.
 */
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
      prisma.projectMapModel.findUnique({ where: { projectId } }),
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
    // BigInt isn't JSON-serializable — `revision` is a BigInt column, and
    // returning it raw throws "Do not know how to serialize a BigInt"
    // inside NextResponse.json rather than failing anywhere obvious.
    inventoryRevision: inventoryState ? inventoryState.revision.toString() : null,
    threeD: {
      hasMapModel: Boolean(mapModel),
      mapModelEnabled: mapModel?.enabled ?? false,
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
