import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Real User search/list (PRD_ROZARIS_Admin §12 "Search: User ID, name,
 * email, phone, role/status") — backs the Permissions and Account Controls
 * panels' user pickers. `?q=` matches name/email/phone (substring,
 * case-insensitive); `?role=` narrows to a role. Excludes soft-deleted
 * users by default (they're in the Recycle Bin, not this list) unless
 * `?includeDeleted=1`.
 */
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
