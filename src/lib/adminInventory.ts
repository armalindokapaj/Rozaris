import { prisma } from "@/lib/db";

export interface InventoryStatusCounts {
  available: number;
  reserved: number;
  sold: number;
}

export async function getCombinedUnitStatusCounts(): Promise<InventoryStatusCounts> {
  const counts: InventoryStatusCounts = { available: 0, reserved: 0, sold: 0 };

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

const TOLERANCE = 0.05;

export async function getPriceIntelligence(): Promise<PriceIntelligence> {
  const pricesPerSqm: { neighborhoodId: string; pricePerSqm: number }[] = [];

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
    select: { price: true, property: { select: { area: true, neighborhoodId: true } } },
  });
  for (const l of realListings) {
    if (!l.property.area || !l.property.neighborhoodId) continue;
    pricesPerSqm.push({ neighborhoodId: l.property.neighborhoodId, pricePerSqm: l.price / l.property.area });
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
