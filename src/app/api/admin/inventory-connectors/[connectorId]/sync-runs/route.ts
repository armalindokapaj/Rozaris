import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(_request: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { connectorId } = await params;
  const runs = await prisma.inventorySyncRun.findMany({
    where: { connectorId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return NextResponse.json(runs);
}
