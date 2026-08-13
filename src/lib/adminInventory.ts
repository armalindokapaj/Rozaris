import { prisma } from "@/lib/db";
import { projects as mockProjects, listings as mockListings } from "@/lib/mockData";

export interface InventoryStatusCounts {
  available: number;
  reserved: number;
  sold: number;
}

/**
 * Unit counts by commercial status — PRD §8.1 "Inventory Overview" — summed
 * across both the seeded mock catalog (`lib/mockData.ts`, still the public
 * site's live browse catalog — see the schema-header note on why) and real
 * Unit rows (the newer publisher-submission pipeline). Same combine
 * convention already used everywhere else in the admin console (e.g.
 * Viewer3DTab's `[...projects, ...customProjects]`).
 *
 * `coming_soon`/`unavailable` from PRD §8.1's full status list are
 * deliberately absent here — neither the mock nor the real Unit model
 * tracks those states today, and inventing zero-valued buckets for states
 * nothing can ever populate would be its own dishonesty.
 */
export async function getCombinedUnitStatusCounts(): Promise<InventoryStatusCounts> {
  const counts: InventoryStatusCounts = { available: 0, reserved: 0, sold: 0 };

  for (const p of mockProjects) {
    for (const u of p.units) {
      if (u.status === "available") counts.available++;
      else if (u.status === "reserved") counts.reserved++;
      else if (u.status === "sold") counts.sold++;
    }
  }

  const realUnits = await prisma.unit.groupBy({
    by: ["status"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  for (const row of realUnits) {
    if (row.status === "available") counts.available += row._count._all;
    else if (row.status === "reserved") counts.reserved += row._count._all;
    else if (row.status === "sold") counts.sold += row._count._all;
  }

  return counts;
}

export interface PriceIntelligence {
  belowAverage: number;
  atAverage: number;
  aboveAverage: number;
  overallAvgPricePerSqm: number | null;
  sampleSize: number;
}

/** ±5% of a neighborhood's average €/m² counts as "at area average". */
const TOLERANCE = 0.05;

/**
 * A deliberately simple same-neighborhood €/m² benchmark — PRD §8.2 "Price
 * Intelligence dashboard" describes a fuller comparable-set model that also
 * tracks price-change-YoY and "changed recently", both of which need a
 * price-history table this schema doesn't have. This computes only what's
 * honestly derivable today: every active-for-sale mock + real unit/listing's
 * €/m², grouped by neighborhood, classified against that neighborhood's own
 * average. The route calling this returns YoY/"changed recently" as
 * explicitly unavailable rather than fabricating a number (PRD §20.2 "never
 * show 0 when a data source failed").
 */
export async function getPriceIntelligence(): Promise<PriceIntelligence> {
  const pricesPerSqm: { neighborhoodId: string; pricePerSqm: number }[] = [];

  for (const p of mockProjects) {
    for (const u of p.units) {
      if (u.status !== "available" || u.transaction !== "sale" || !u.area) continue;
      pricesPerSqm.push({ neighborhoodId: p.neighborhoodId, pricePerSqm: u.price / u.area });
    }
  }
  for (const l of mockListings) {
    if (l.status !== "active" || l.transaction !== "sale" || !l.area) continue;
    pricesPerSqm.push({ neighborhoodId: l.neighborhoodId, pricePerSqm: l.price / l.area });
  }

  const realUnits = await prisma.unit.findMany({
    where: { deletedAt: null, status: "available", transaction: "sale" },
    select: { price: true, area: true, project: { select: { neighborhoodId: true } } },
  });
  for (const u of realUnits) {
    if (!u.area) continue;
    pricesPerSqm.push({ neighborhoodId: u.project.neighborhoodId, pricePerSqm: u.price / u.area });
  }

  const realListings = await prisma.listing.findMany({
    where: { deletedAt: null, status: "active", transaction: "sale" },
    select: { price: true, area: true, neighborhoodId: true },
  });
  for (const l of realListings) {
    if (!l.area) continue;
    pricesPerSqm.push({ neighborhoodId: l.neighborhoodId, pricePerSqm: l.price / l.area });
  }

  if (pricesPerSqm.length === 0) {
    return { belowAverage: 0, atAverage: 0, aboveAverage: 0, overallAvgPricePerSqm: null, sampleSize: 0 };
  }

  const byNeighborhood = new Map<string, number[]>();
  for (const pt of pricesPerSqm) {
    const arr = byNeighborhood.get(pt.neighborhoodId) ?? [];
    arr.push(pt.pricePerSqm);
    byNeighborhood.set(pt.neighborhoodId, arr);
  }
  const avgByNeighborhood = new Map<string, number>();
  for (const [id, vals] of byNeighborhood) {
    avgByNeighborhood.set(id, vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  let belowAverage = 0;
  let atAverage = 0;
  let aboveAverage = 0;
  for (const pt of pricesPerSqm) {
    const avg = avgByNeighborhood.get(pt.neighborhoodId)!;
    const diff = (pt.pricePerSqm - avg) / avg;
    if (diff < -TOLERANCE) belowAverage++;
    else if (diff > TOLERANCE) aboveAverage++;
    else atAverage++;
  }

  const overallAvgPricePerSqm = pricesPerSqm.reduce((a, b) => a + b.pricePerSqm, 0) / pricesPerSqm.length;

  return { belowAverage, atAverage, aboveAverage, overallAvgPricePerSqm, sampleSize: pricesPerSqm.length };
}
