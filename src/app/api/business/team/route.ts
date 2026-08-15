import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePublisherSession, requireOrgRole } from "@/lib/publisherAuth";
import { logAuditEvent } from "@/lib/audit";
import type { OrganizationRole } from "@/generated/prisma";

/**
 * §8 "Business Teams, Roles & Permissions" — the owner (via
 * `Publisher.ownerUserId`, not a membership row) plus every accepted
 * `OrganizationMembership`, plus outstanding `OrganizationInvitation`s.
 * Any team member can read the roster; only Owner/Org Admin can invite,
 * change a role, or remove someone (`requireOrgRole()`).
 */
export async function GET() {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const [publisher, memberships, invitations] = await Promise.all([
    prisma.publisher.findUnique({
      where: { id: gate.user.publisherId },
      select: { owner: { select: { id: true, name: true, email: true, image: true } } },
    }),
    prisma.organizationMembership.findMany({
      where: { publisherId: gate.user.publisherId, status: "active" },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationInvitation.findMany({
      where: { publisherId: gate.user.publisherId, status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!publisher) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({
    owner: publisher.owner,
    members: memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
    })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt })),
  });
}

const inviteSchema = z.object({
  email: z.string().trim().email().max(160),
  role: z.enum(["admin", "agent", "content_editor", "viewer"]),
});

export async function POST(request: Request) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const publisher = await prisma.publisher.findUnique({
    where: { id: gate.user.publisherId },
    select: { owner: { select: { email: true } } },
  });
  if (publisher?.owner.email === email) {
    return NextResponse.json({ error: "That email already owns this organization." }, { status: 400 });
  }

  const invitation = await prisma.organizationInvitation.upsert({
    where: { publisherId_email: { publisherId: gate.user.publisherId, email } },
    create: {
      publisherId: gate.user.publisherId,
      email,
      role: parsed.data.role,
      invitedBy: gate.user.id!,
    },
    update: { role: parsed.data.role, status: "pending", respondedAt: null },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "org",
    actorId: gate.user?.id,
    action: `Invited ${email} as ${parsed.data.role}`,
    entityType: "OrganizationInvitation",
    entityId: invitation.id,
    entityLabel: email,
  });

  return NextResponse.json(invitation);
}

const roleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["admin", "agent", "content_editor", "viewer"]),
});

export async function PATCH(request: Request) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;

  const parsed = roleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const membership = await prisma.organizationMembership.findUnique({ where: { id: parsed.data.membershipId } });
  if (!membership || membership.publisherId !== gate.user?.publisherId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const updated = await prisma.organizationMembership.update({
    where: { id: membership.id },
    data: { role: parsed.data.role as OrganizationRole },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "org",
    actorId: gate.user?.id,
    action: `Team member role → ${parsed.data.role}`,
    entityType: "OrganizationMembership",
    entityId: membership.id,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const gate = await requireOrgRole();
  if (gate instanceof NextResponse) return gate;

  const membershipId = new URL(request.url).searchParams.get("membershipId");
  if (!membershipId) return NextResponse.json({ error: "membershipId required." }, { status: 400 });

  const membership = await prisma.organizationMembership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.publisherId !== gate.user?.publisherId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.organizationMembership.delete({ where: { id: membershipId } });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "org",
    actorId: gate.user?.id,
    action: "Team member removed",
    entityType: "OrganizationMembership",
    entityId: membershipId,
  });

  return NextResponse.json({ ok: true });
}
