import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const counts = new Map<string, number>();
  const bump = (city: string | null | undefined) => {
    const key = (city ?? "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  const [realProjects, realListings] = await Promise.all([
    prisma.project.findMany({ where: { deletedAt: null }, select: { city: true } }),
    prisma.listing.findMany({ where: { deletedAt: null }, select: { property: { select: { city: true } } } }),
  ]);
  realProjects.forEach((p) => bump(p.city));
  realListings.forEach((l) => bump(l.property.city));

  const items = Array.from(counts.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return NextResponse.json({ items });
}
