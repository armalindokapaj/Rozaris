import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Multi-Channel Publishing PRD Phase 9 — "which projects can I see at
 * all," the client portal's landing list. Three ways in: own the
 * Publisher outright, an org-wide owner/admin `OrganizationMembership` on
 * the Publisher that owns them, or an explicit `ProjectMembership` row on
 * one specific project regardless of org role. Deliberately its own query
 * rather than a loop calling `requireProjectPermission()` per project —
 * that gate answers "can I touch THIS one," this route answers "which
 * ones," a different question worth its own (much cheaper) query shape.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const orgWideAccess = session.user.publisherId && (session.user.orgRole === "owner" || session.user.orgRole === "admin");

  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(orgWideAccess ? [{ publisherId: session.user.publisherId! }] : []),
        { memberships: { some: { userId: session.user.id } } },
      ],
    },
    select: { id: true, slug: true, name: true, city: true, heroImage: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(projects);
}
