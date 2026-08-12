import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/** Restores a previously-published (now archived) version back to
 * published — PRD_Admin_Mapbox_GLB §19 "Rollback". */
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
  if (version.publicationStatus !== "archived") {
    return NextResponse.json(
      { error: "Only an archived (previously published) version can be rolled back to." },
      { status: 409 }
    );
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.mapModelVersion.updateMany({
      where: { projectId, publicationStatus: "published" },
      data: { publicationStatus: "archived" },
    });
    return tx.mapModelVersion.update({
      where: { id: versionId },
      data: { publicationStatus: "published", publishedAt: now, publishedBy: actor },
    });
  });

  await logAuditEvent({
    actor,
    action: "Map model rolled back",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
