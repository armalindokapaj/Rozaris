import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getCombinedUnitStatusCounts, getPriceIntelligence } from "@/lib/adminInventory";

/**
 * PRD_ROZARIS_Admin_Dashboard §8 "Inventory Overview & Price Intelligence".
 * `priceChangedRecently` and `priceChangeYoY` are `null` — no
 * price-history table exists to compute either honestly (see
 * adminInventory.ts's doc comment); the Dashboard must render these as an
 * explicit "not available" state, never a fabricated number (§20.2).
 */
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
