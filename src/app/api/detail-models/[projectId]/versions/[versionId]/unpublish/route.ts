import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
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
