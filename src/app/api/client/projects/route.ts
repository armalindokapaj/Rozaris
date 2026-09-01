import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

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
