import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/** Publish Gate (PRD_Admin_Mapbox_GLB §6 "BLOCKED — Cannot publish") —
 * flips any currently-published version to archived and this one to
 * published, in one transaction so the public map never sees a moment with
 * zero or two published versions. */
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
  if (version.validationStatus === "blocked") {
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
    action: "Map model published",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
