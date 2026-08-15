import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

/**
 * §14.4 "Business invitation" flow, continued — accept/decline one
 * invitation addressed to the signed-in account's own email. Accepting
 * creates the real `OrganizationMembership` row and (if needed) flips the
 * account's `role` to "publisher" so `requirePublisherSession()` resolves
 * it on the next request. Deliberately narrow: an account can only ever
 * be affiliated with one organization at a time (owner OR one active
 * membership) — the same constraint `Publisher.ownerUserId @unique`
 * already implies for owners.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;

  const invitation = await prisma.organizationInvitation.findUnique({ where: { id } });
  if (!invitation || invitation.status !== "pending" || invitation.email !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }

  const [ownedPublisher, existingMembership] = await Promise.all([
    prisma.publisher.findUnique({ where: { ownerUserId: session.user.id } }),
    prisma.organizationMembership.findFirst({ where: { userId: session.user.id, status: "active" } }),
  ]);
  if (ownedPublisher || existingMembership) {
    return NextResponse.json({ error: "You're already part of an organization." }, { status: 400 });
  }

  const [membership] = await prisma.$transaction([
    prisma.organizationMembership.create({
      data: {
        publisherId: invitation.publisherId,
        userId: session.user.id,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
      },
    }),
    prisma.organizationInvitation.update({
      where: { id },
      data: { status: "accepted", respondedAt: new Date() },
    }),
    prisma.user.update({ where: { id: session.user.id }, data: { role: "publisher" } }),
  ]);

  await logAuditEvent({
    actor: session.user.email,
    actorId: session.user.id,
    action: `Accepted invitation to join organization as ${invitation.role}`,
    entityType: "OrganizationMembership",
    entityId: membership.id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;

  const invitation = await prisma.organizationInvitation.findUnique({ where: { id } });
  if (!invitation || invitation.status !== "pending" || invitation.email !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }

  await prisma.organizationInvitation.update({
    where: { id },
    data: { status: "declined", respondedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
