import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/** Admin-facing Publisher list (fuller shape than the public
 * `/api/publishers` picker — includes verification/restriction/deletion
 * state) — backs the Account Controls panel's publisher picker. `?q=`
 * matches name/slug. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  const where: Record<string, unknown> = { deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const publishers = await prisma.publisher.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
      verified: true,
      restricted: true,
      restrictedReason: true,
    },
    take: 100,
  });

  return NextResponse.json(publishers);
}
