import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateRentVsBuy, type RentBuyScenario } from "@/lib/rentVsBuy";

// PRD_Rent_vs_Buy.pdf §15: "Calculation logic should live in a shared
// server-side/domain package... front-end may mirror formulas only if
// generated from the same tested calculation library; do not maintain two
// independent implementations." This route and the client page both call
// the exact same src/lib/rentVsBuy.ts — the client calls it directly for
// zero-latency live recalculation while typing, this route exists so the
// same math is also reachable as a real server endpoint (§15's suggested
// shape), not a second reimplementation.
const scenarioSchema = z.object({
  currency: z.enum(["EUR", "ALL"]),
  locationText: z.string().min(1),
  holdingPeriodYears: z.number().min(1).max(30),
  rentMonthly: z.number().min(0),
  rentGrowthAnnual: z.number().min(-0.2).max(0.5),
  renterInsuranceMonthly: z.number().min(0),
  securityDepositMonths: z.number().min(0).max(12),
  depositRefundable: z.boolean(),
  renterMovingCosts: z.number().min(0),
  propertyPrice: z.number().min(0),
  downPaymentPercent: z.number().min(0).max(1),
  mortgageRateAnnual: z.number().min(0).max(0.3),
  loanTermYears: z.number().min(1).max(40),
  homeAppreciationAnnual: z.number().min(-0.3).max(0.5),
  propertyTaxRateAnnual: z.number().min(0).max(0.2),
  homeInsuranceMonthly: z.number().min(0),
  maintenanceRateAnnual: z.number().min(0).max(0.2),
  hoaMonthly: z.number().min(0),
  purchaseClosingCostRate: z.number().min(0).max(0.3),
  sellingCostRate: z.number().min(0).max(0.3),
  investmentReturnAnnual: z.number().min(-0.5).max(0.5),
  investmentFeeDragAnnual: z.number().min(0).max(0.2),
}) satisfies z.ZodType<RentBuyScenario>;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = scenarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid scenario", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.propertyPrice <= 0 || parsed.data.rentMonthly <= 0) {
    return NextResponse.json(
      { error: "Property price and monthly rent must be greater than zero." },
      { status: 400 }
    );
  }
  const result = calculateRentVsBuy(parsed.data);
  return NextResponse.json({ result });
}
