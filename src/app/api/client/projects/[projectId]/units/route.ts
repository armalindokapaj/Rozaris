import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectPermission } from "@/lib/permissions/projectAccess";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const gate = await requireProjectPermission(projectId, "inventory:read");
  if (gate instanceof NextResponse) return gate;

  const units = await prisma.unit.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(units);
}
