import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { logAuditEvent } from "@/lib/audit";

/**
 * Account & Profile System PRD v1.0 §14.6 "Account deletion — User
 * requests deletion -> explain consequences -> re-authenticate -> process
 * required retention/anonymization rules -> revoke sessions." Real
 * self-service soft-delete, same `deletedAt`/`deletedBy` mechanism the
 * admin Recycle Bin already uses (`src/lib/adminEntities.ts`'s `user`
 * config) — `deletedBy` is tagged with the account's own email so the
 * audit trail can tell a self-service deletion from an admin one. Blocks
 * a request while the account still owns an organization (§9's Publisher
 * relation is a hard `ownerUserId @unique` FK — deleting the owner would
 * orphan every Listing/Project/LeadItem under it); an active team
 * membership is just removed, same as leaving a team normally.
 */
const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Password required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  if (!user.passwordHash) {
    return NextResponse.json({ error: "This account has no password set (OAuth-only)." }, { status: 400 });
  }
  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Password is incorrect." }, { status: 400 });
  }

  const ownedOrg = await prisma.publisher.findUnique({ where: { ownerUserId: user.id } });
  if (ownedOrg) {
    return NextResponse.json(
      { error: "You own an organization. Transfer ownership or delete it first." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.organizationMembership.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), deletedBy: user.email ?? "self" },
    }),
  ]);

  await logAuditEvent({
    actor: user.email ?? user.name ?? "self",
    actorId: user.id,
    action: "Account deleted (self-service)",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.name,
  });

  return NextResponse.json({ ok: true });
}
