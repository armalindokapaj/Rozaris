import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/publisherAuth";
import { logAuditEvent } from "@/lib/audit";

/** Owner/Org Admin revoking a pending invitation they sent — distinct from
 * the invitee declining it (`DELETE /api/account/invitations/[id]`). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const invitation = await prisma.organizationInvitation.findUnique({ where: { id } });
  if (!invitation || invitation.publisherId !== gate.user?.publisherId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.organizationInvitation.delete({ where: { id } });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "org",
    actorId: gate.user?.id,
    action: `Revoked invitation to ${invitation.email}`,
    entityType: "OrganizationInvitation",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
