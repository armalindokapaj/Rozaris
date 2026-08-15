import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * "Top Locations" for the Dashboard — deliberately labeled *by Inventory*,
 * not *by Views*: no page-view/analytics-event table exists anywhere in
 * this schema (confirmed — grepped for `views`/`viewCount`/`pageview`,
 * nothing tracks it), so a "views" ranking would have to be fabricated.
 * City counts of real, live inventory (Project + Listing) is the closest
 * honest equivalent: it answers the same underlying question ("where is
 * the platform's activity concentrated") with data that's actually real.
 *
 * ⚠️ Real-data fix (see the "Rozaris Platform Audit" memory's
 * Projects/Units migration): this used to also count mockData's static
 * arrays alongside these same Prisma queries — a double-count once
 * `prisma/seed.ts` started seeding every mockData project/listing into
 * these same tables (kept 1:1 on every seed run). Real Postgres now
 * covers every row on its own.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const counts = new Map<string, number>();
  const bump = (city: string | null | undefined) => {
    const key = (city ?? "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  // `city` moved off Listing onto its related Property row in the
  // Property/Listing split (see MEMORY note "rozaris-controlled-taxonomy-
  // spec").
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
