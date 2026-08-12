import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/**
 * Takes the currently-published version off the public map without
 * publishing a replacement — the "Remove model" action. Distinct from
 * DELETE .../versions/[versionId] (which only ever discards an unpublished
 * *draft*, never destroys a published/archived version's row — versions are
 * immutable per PRD_Admin_Mapbox_GLB §18). This just archives it, so
 * `GET /api/map-models/[projectId]` starts returning `null` (no model on
 * the map) while the version stays in history and can still be rolled back
 * to later.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.mapModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus !== "published") {
    return NextResponse.json({ error: "Only the published version can be removed from the map." }, { status: 409 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const updated = await prisma.mapModelVersion.update({
    where: { id: versionId },
    data: { publicationStatus: "archived" },
  });

  await logAuditEvent({
    actor,
    action: "Map model removed from map",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
