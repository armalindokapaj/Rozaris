import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/**
 * Restores a previously-published (now archived) version back to
 * published — PRD_Admin_Mapbox_GLB §19 "Rollback".
 *
 * `{"force": true}` (Super Admin control/audit pass) also allows rolling
 * back to a version NOT currently archived (e.g. still draft) — Super
 * Admin only, mandatory `reason`.
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
  const version = await prisma.mapModelVersion.findUnique({ where: { id: versionId } });
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
    actorId: gate.user?.id,
    action: force ? "Map model force-rolled back" : "Map model rolled back",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
    reason: force ? reason : undefined,
  });

  return NextResponse.json(updated);
}
