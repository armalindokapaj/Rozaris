import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * User Activity Timeline — every AuditLog row this user was the actor for
 * ("who changed what, when"), plus the rows recorded *against* their own
 * User entity (account status/permission changes done *to* them). Two
 * separate lists rather than one merged feed: "what they did" and "what
 * was done to them" are different questions an admin asks.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [asActor, aboutThem] = await Promise.all([
    prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: { entityType: "User", entityId: userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, asActor, aboutThem });
}
