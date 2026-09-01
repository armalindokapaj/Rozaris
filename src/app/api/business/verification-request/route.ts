import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/publisherAuth";
import { logAuditEvent } from "@/lib/audit";

export async function POST() {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const before = await prisma.publisher.findUnique({ where: { id: gate.user.publisherId } });
  if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (before.verificationStatus === "pending" || before.verificationStatus === "verified") {
    return NextResponse.json({ error: "Already pending or already verified." }, { status: 400 });
  }

  const updated = await prisma.publisher.update({
    where: { id: before.id },
    data: {
      verificationStatus: "pending",
      verificationSubmittedAt: new Date(),
      verificationRejectionReason: null,
    },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "org",
    actorId: gate.user?.id,
    action: "Business verification requested",
    entityType: "Publisher",
    entityId: before.id,
    entityLabel: before.name,
    previousState: { verificationStatus: before.verificationStatus },
    newState: { verificationStatus: updated.verificationStatus },
  });

  return NextResponse.json({ ok: true });
}
