import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/publisherAuth";
import { logAuditEvent } from "@/lib/audit";

/** Revoke, never hard-delete — same "keep the trace, cut the access"
 * shape as `ProjectPublishTarget` suspension (PRD §60 "Do not delete
 * anything"). `requireApiCredential()` already refuses any credential
 * with `revokedAt` set. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const { id } = await params;
  const existing = await prisma.clientApiCredential.findUnique({ where: { id } });
  if (!existing || existing.publisherId !== gate.user.publisherId) {
    return NextResponse.json({ error: "Credential not found." }, { status: 404 });
  }
  if (existing.revokedAt) {
    return NextResponse.json({ error: "Already revoked." }, { status: 409 });
  }

  const updated = await prisma.clientApiCredential.update({ where: { id }, data: { revokedAt: new Date() } });

  const actor = gate.user?.email ?? gate.user?.name ?? "publisher";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "API credential revoked",
    entityType: "ClientApiCredential",
    entityId: id,
    entityLabel: existing.name,
    metadata: { publisherId: gate.user.publisherId },
  });

  return NextResponse.json(updated);
}
