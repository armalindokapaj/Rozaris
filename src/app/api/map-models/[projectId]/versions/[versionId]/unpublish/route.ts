import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.mapModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus !== "published") {
    return NextResponse.json({ error: "Only the published version can be removed from the map." }, { status: 409 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const updated = await prisma.mapModelVersion.update({
    where: { id: versionId },
    data: { publicationStatus: "archived" },
  });

  await logAuditEvent({
    actor,
    action: "Map model removed from map",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${updated.version}`,
  });

  return NextResponse.json(updated);
}
