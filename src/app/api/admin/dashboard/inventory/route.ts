import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getCombinedUnitStatusCounts, getPriceIntelligence } from "@/lib/adminInventory";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [units, priceIntelligence] = await Promise.all([
    getCombinedUnitStatusCounts(),
    getPriceIntelligence(),
  ]);

  return NextResponse.json({
    units,
    priceIntelligence: {
      ...priceIntelligence,
      priceChangedRecently: null,
      priceChangeYoY: null,
    },
  });
}
