import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; membershipId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, membershipId } = await params;
  const existing = await prisma.projectMembership.findUnique({
    where: { id: membershipId },
    include: { user: { select: { email: true } } },
  });
  if (!existing || existing.projectId !== projectId) {
    return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  }

  await prisma.projectMembership.delete({ where: { id: membershipId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Project member removed",
    entityType: "ProjectMembership",
    entityId: membershipId,
    entityLabel: `${existing.user.email} (${existing.role})`,
    metadata: { projectId },
  });

  return NextResponse.json({ ok: true });
}
