import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

/** Restores a previously-published (now archived) version back to
 * published — PRD_Admin_3D_Project_Experience §37 "Rollback" (restores
 * model, mapping snapshot, scene/camera/appearance/construction config —
 * this pass's mapping snapshot is the UnitMeshLinkV2 rows already tied to
 * that version, no extra copy needed). Does not touch live inventory data,
 * per §37's explicit rule — nothing here writes to Unit rows. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
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
    await tx.detailModelVersion.updateMany({
      where: { projectId, publicationStatus: "published" },
      data: { publicationStatus: "archived" },
    });
    return tx.detailModelVersion.update({
      where: { id: versionId },
      data: { publicationStatus: "published", publishedAt: now, publishedBy: actor },
      include: { unitLinks: true },
    });
  });

  await refreshExperienceDocument(prisma, projectId, versionId);

  await logAuditEvent({
    actor,
    action: "Detail model rolled back",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
