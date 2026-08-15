import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** §14.4 "Business invitation" flow — pending `OrganizationInvitation`
 * rows addressed to the signed-in account's own verified email. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const invitations = await prisma.organizationInvitation.findMany({
    where: { email: session.user.email.toLowerCase(), status: "pending" },
    include: { publisher: { select: { id: true, name: true, type: true, logoUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    invitations.map((i) => ({
      id: i.id,
      role: i.role,
      createdAt: i.createdAt,
      organization: i.publisher,
    }))
  );
}
