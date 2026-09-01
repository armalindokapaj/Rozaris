import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const items = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      actor: true,
      action: true,
      entityType: true,
      entityId: true,
      entityLabel: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}
