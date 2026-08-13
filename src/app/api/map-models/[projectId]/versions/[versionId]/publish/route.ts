import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/**
 * Publish Gate (PRD_Admin_Mapbox_GLB §6 "BLOCKED — Cannot publish") —
 * flips any currently-published version to archived and this one to
 * published, in one transaction so the public map never sees a moment with
 * zero or two published versions.
 *
 * `{"force": true}` (Super Admin control/audit pass) bypasses the
 * validation-status block for the "broken production 3D, need it back now"
 * emergency case PRD_ROZARIS_Admin §14 names — Super Admin only, and a
 * `reason` is required so the override itself is explainable in the audit
 * trail, not just the fact that it happened.
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
    return NextResponse.json({ error: "A reason is required to force-publish." }, { status: 400 });
  }

  const { projectId, versionId } = await params;
  const version = await prisma.mapModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.validationStatus === "blocked" && !force) {
    return NextResponse.json(
      { error: "Blocked by validation — fix the source GLB and upload a new version." },
      { status: 422 }
    );
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.mapModelVersion.updateMany({
      where: { projectId, publicationStatus: "published", NOT: { id: versionId } },
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
    action: force ? "Map model force-published (validation bypassed)" : "Map model published",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
    reason: force ? reason : undefined,
  });

  return NextResponse.json(updated);
}
