import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

/**
 * Takes the currently-published detailed model off the project's 3D
 * Experience page without publishing a replacement — the "Remove model"
 * action. Distinct from DELETE .../versions/[versionId] (which only ever
 * discards an unpublished *draft*, never a published/archived version's
 * row — versions are immutable). This just archives it, so
 * `GET /api/detail-models/[projectId]` starts returning `null` while the
 * version stays in history and can still be rolled back to later.
 */
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
  if (version.publicationStatus !== "published") {
    return NextResponse.json({ error: "Only the published version can be removed." }, { status: 409 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const updated = await prisma.detailModelVersion.update({
    where: { id: versionId },
    data: { publicationStatus: "archived" },
  });
  await refreshExperienceDocument(prisma, projectId, versionId);

  await logAuditEvent({
    actor,
    action: "Detail model removed",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
