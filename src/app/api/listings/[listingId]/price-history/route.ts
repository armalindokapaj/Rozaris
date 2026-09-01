import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const { listingId } = await params;

  const entries = await prisma.priceHistoryEntry.findMany({
    where: { listingId },
    orderBy: { recordedAt: "asc" },
    select: { price: true, currency: true, recordedAt: true },
  });

  const first = entries[0];
  const latest = entries[entries.length - 1];
  const changePercent =
    first && latest && first.price > 0 ? ((latest.price - first.price) / first.price) * 100 : null;

  return NextResponse.json({ entries, changePercent });
}
