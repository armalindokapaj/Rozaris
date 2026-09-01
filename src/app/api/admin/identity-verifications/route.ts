import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const users = await prisma.user.findMany({
    where: { identityVerificationStatus: "pending" },
    select: {
      id: true,
      name: true,
      email: true,
      identitySubmittedAt: true,
      identityNote: true,
    },
    orderBy: { identitySubmittedAt: "asc" },
  });
  return NextResponse.json(users);
}
