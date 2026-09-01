import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const role = url.searchParams.get("role");
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  const where: Record<string, unknown> = {};
  if (!includeDeleted) where.deletedAt = null;
  if (role) where.role = role;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      superAdmin: true,
      adminScopes: true,
      statusUntil: true,
      createdAt: true,
    },
    take: 100,
  });

  return NextResponse.json(users);
}
