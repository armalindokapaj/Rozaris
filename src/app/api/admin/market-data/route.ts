import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

interface Bucket {
  locationId: string | null;
  locationName: string;
  saleSum: number;
  saleCount: number;
  saleSumPrior: number;
  saleCountPrior: number;
  rentSum: number;
  rentCount: number;
}

/**
 * Market Data Engine (PRD_ROZARIS_Admin §12) — real €/m² by location,
 * computed on the fly from completed `Transaction` rows (not a fabricated
 * or hand-entered number). Reads as genuinely empty right after the
 * platform's content wipe (see the "Rozaris Platform Audit" memory) —
 * that's honest, the alternative would be inventing figures. `€/m²` needs
 * both a real price (`Transaction.price`) and a real area
 * (`Property.area`); a transaction missing either, or flagged
 * `excludedFromStats`, is skipped.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const now = Date.now();
  const rows = await prisma.transaction.findMany({
    where: { status: "completed", excludedFromStats: false, price: { not: null } },
    select: {
      type: true,
      price: true,
      occurredAt: true,
      listing: {
        select: {
          property: {
            select: { area: true, locationId: true, neighborhoodId: true, city: true, location: { select: { officialName: true } } },
          },
        },
      },
    },
  });

  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const property = r.listing.property;
    if (!property.area || property.area <= 0 || !r.price) continue;
    const key = property.locationId ?? property.neighborhoodId ?? property.city ?? "unknown";
    const name = property.location?.officialName ?? property.city ?? property.neighborhoodId ?? "Unknown";
    if (!buckets.has(key)) {
      buckets.set(key, {
        locationId: property.locationId,
        locationName: name,
        saleSum: 0,
        saleCount: 0,
        saleSumPrior: 0,
        saleCountPrior: 0,
        rentSum: 0,
        rentCount: 0,
      });
    }
    const b = buckets.get(key)!;
    const pricePerSqm = r.price / property.area;
    const ageMs = now - r.occurredAt.getTime();

    if (r.type === "sale") {
      if (ageMs <= TWELVE_MONTHS_MS) {
        b.saleSum += pricePerSqm;
        b.saleCount += 1;
      } else if (ageMs <= TWELVE_MONTHS_MS * 2) {
        b.saleSumPrior += pricePerSqm;
        b.saleCountPrior += 1;
      }
    } else if (ageMs <= TWELVE_MONTHS_MS) {
      b.rentSum += pricePerSqm;
      b.rentCount += 1;
    }
  }

  const result = Array.from(buckets.values())
    .map((b) => {
      const saleAvg = b.saleCount > 0 ? b.saleSum / b.saleCount : null;
      const saleAvgPrior = b.saleCountPrior > 0 ? b.saleSumPrior / b.saleCountPrior : null;
      return {
        locationId: b.locationId,
        locationName: b.locationName,
        saleAvgPerSqm: saleAvg,
        saleCount: b.saleCount,
        rentAvgPerSqm: b.rentCount > 0 ? b.rentSum / b.rentCount : null,
        rentCount: b.rentCount,
        // Real "12 month change" only when both windows have data —
        // otherwise null, shown as "not enough data" rather than 0%.
        twelveMonthChangePercent:
          saleAvg != null && saleAvgPrior != null && saleAvgPrior > 0
            ? ((saleAvg - saleAvgPrior) / saleAvgPrior) * 100
            : null,
      };
    })
    .sort((a, b) => (b.saleCount + b.rentCount) - (a.saleCount + a.rentCount));

  return NextResponse.json(result);
}
