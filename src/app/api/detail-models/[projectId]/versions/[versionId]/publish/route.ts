import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

/** Publish Gate (PRD_Admin_3D_Project_Experience §35 "Publish Gate" —
 * "GLB validation not BLOCKED"). Flips any currently-published version to
 * archived and this one to published, in one transaction.
 *
 * Rewrite Track B, step 5 expanded this beyond the single validationStatus
 * check: also blocks on duplicate unit bindings (the master PRD's own
 * rule — "Projects with inventory mode enabled must not publish with
 * critical duplicate or missing bindings", §9.3), a real data-integrity
 * concern (two GLB nodes both claiming the same real inventory unit).
 * Deliberately did NOT add "starting camera preset required" or "poster
 * generated" as hard gates: every project already gets a real, sensible
 * starting camera auto-computed from the model's bounding box even with
 * zero saved presets (requiring one would block the common case, not
 * protect against a real problem), and poster generation needs a new
 * client-side capture flow this pass doesn't add — both explicitly
 * deferred, not silently dropped.
 *
 * `{"force": true}` (Super Admin control/audit pass) bypasses BOTH gates
 * above for the "broken production 3D, need it back now" emergency case —
 * Super Admin only, mandatory `reason`, same pattern as the map-model
 * publish route's identical addition. */
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
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.validationStatus === "blocked" && !force) {
    return NextResponse.json(
      { error: "Blocked by validation — fix the source GLB and upload a new version." },
      { status: 422 }
    );
  }

  const links = await prisma.unitMeshLinkV2.findMany({ where: { detailModelVersionId: versionId } });
  const unitIdCounts = new Map<string, number>();
  for (const l of links) unitIdCounts.set(l.unitId, (unitIdCounts.get(l.unitId) ?? 0) + 1);
  const duplicateUnitIds = Array.from(unitIdCounts.entries()).filter(([, count]) => count > 1);
  if (duplicateUnitIds.length > 0 && !force) {
    return NextResponse.json(
      {
        error: `${duplicateUnitIds.length} real unit${duplicateUnitIds.length === 1 ? " is" : "s are"} linked to more than one mesh in this version — fix the duplicate mapping${duplicateUnitIds.length === 1 ? "" : "s"} in Link Units before publishing.`,
      },
      { status: 422 }
    );
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Multiple Detail-Model Slots pass — scoped to THIS version's own
    // slotId, not the whole project: publishing "Surroundings" must not
    // archive "Building"'s independently-published version.
    await tx.detailModelVersion.updateMany({
      where: { slotId: version.slotId, publicationStatus: "published", NOT: { id: versionId } },
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
    action: force ? "Detail model force-published (validation bypassed)" : "Detail model published",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
    reason: force ? reason : undefined,
  });

  return NextResponse.json(updated);
}
