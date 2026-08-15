import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Price history — spec item 31 (see MEMORY note
 * "rozaris-controlled-taxonomy-spec"): "€220,000 — Jan, €210,000 — Mar,
 * €199,000 — Aug... Price reduced 9.5%." Rows are written by `POST
 * /api/listings` (the first point, at creation) and `PATCH
 * /api/listings/[listingId]` (one more per real price change) — this
 * route only reads them back, oldest first so a chart/list can render
 * directly off the array order. Ungated, same convention as the listing
 * detail page itself — price history isn't more sensitive than the
 * current price already shown there.
 */
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
