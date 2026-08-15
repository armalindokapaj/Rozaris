import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/** Admin's Identity Verification queue — real `pending` requests, oldest
 * first. §9.4 "internal risk/moderation notes" stays admin-only (`identityNote`
 * is never exposed to any public/other-user surface, only this route). */
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
