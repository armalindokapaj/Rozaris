import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/** Publish Gate (PRD_Admin_3D_Project_Experience §35 "Publish Gate" —
 * "GLB validation not BLOCKED"). Flips any currently-published version to
 * archived and this one to published, in one transaction. */
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
  if (version.validationStatus === "blocked") {
    return NextResponse.json(
      { error: "Blocked by validation — fix the source GLB and upload a new version." },
      { status: 422 }
    );
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.detailModelVersion.updateMany({
      where: { projectId, publicationStatus: "published", NOT: { id: versionId } },
      data: { publicationStatus: "archived" },
    });
    return tx.detailModelVersion.update({
      where: { id: versionId },
      data: { publicationStatus: "published", publishedAt: now, publishedBy: actor },
      include: { unitLinks: true },
    });
  });

  await logAuditEvent({
    actor,
    action: "Detail model published",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
