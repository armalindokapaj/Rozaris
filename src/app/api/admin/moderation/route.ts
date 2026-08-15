import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/** Real Moderation queue — every `ModerationReport`, newest first, with
 * enough of the reported listing/project's own data to render without a
 * second round-trip. Replaces ModerationTab's previous hardcoded
 * `seedCases()` (3 mock cases pointed at fixed mockData rows). */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const status = new URL(request.url).searchParams.get("status") ?? "pending";

  const reports = await prisma.moderationReport.findMany({
    where: status === "all" ? {} : { status: status as "pending" | "actioned" | "dismissed" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const listingIds = reports.filter((r) => r.entityType === "listing").map((r) => r.entityId);
  const projectIds = reports.filter((r) => r.entityType === "project").map((r) => r.entityId);
  const [listingRows, projectRows] = await Promise.all([
    listingIds.length
      ? prisma.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true, slug: true } })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([]),
  ]);
  const listingById = new Map(listingRows.map((l) => [l.id, l]));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  return NextResponse.json(
    reports.map((r) => {
      const listing = r.entityType === "listing" ? listingById.get(r.entityId) : undefined;
      const project = r.entityType === "project" ? projectById.get(r.entityId) : undefined;
      return {
        id: r.id,
        entityType: r.entityType,
        entityId: r.entityId,
        caseType: r.caseType,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        entityLabel: listing?.title ?? project?.name ?? "(deleted)",
        entityHref: listing ? `/listing/${listing.slug}` : project ? `/project/${project.slug}` : null,
      };
    })
  );
}
