import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

/**
 * Restores a previously-published (now archived) version back to
 * published — PRD_Admin_3D_Project_Experience §37 "Rollback" (restores
 * model, mapping snapshot, scene/camera/appearance/construction config —
 * this pass's mapping snapshot is the UnitMeshLinkV2 rows already tied to
 * that version, no extra copy needed). Does not touch live inventory data,
 * per §37's explicit rule — nothing here writes to Unit rows.
 *
 * `{"force": true}` (Super Admin control/audit pass) also allows rolling
 * back to a version NOT currently archived — Super Admin only, mandatory
 * `reason`, same pattern as the map-model rollback route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  const gate = force ? await requireSuperAdmin() : await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (force && !reason) {
    return NextResponse.json({ error: "A reason is required to force-rollback." }, { status: 400 });
  }

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus !== "archived" && !force) {
    return NextResponse.json(
      { error: "Only an archived (previously published) version can be rolled back to." },
      { status: 409 }
    );
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Multiple Detail-Model Slots pass — scoped to THIS version's own
    // slotId (same reasoning as the publish route's identical fix).
    await tx.detailModelVersion.updateMany({
      where: { slotId: version.slotId, publicationStatus: "published" },
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
    actorId: gate.user?.id,
    action: force ? "Detail model force-rolled back" : "Detail model rolled back",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
    reason: force ? reason : undefined,
  });

  return NextResponse.json(updated);
}
