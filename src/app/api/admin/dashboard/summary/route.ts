import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { projects as mockProjects, listings as mockListings } from "@/lib/mockData";
import { getCombinedUnitStatusCounts } from "@/lib/adminInventory";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface KpiValue {
  value: number;
  /** New in the last 7 days — `null` when that can't be honestly computed
   * (e.g. Unit has no `createdAt` column) rather than shown as 0. */
  newThisWeek: number | null;
  /** "real" = live DB only, "mixed" = seeded catalog + live DB combined
   * (same combine convention used everywhere else in the admin console —
   * see adminInventory.ts's doc comment), "mock" = seeded/demo only. Lets
   * the Dashboard mark KPIs that aren't fully real without hiding them. */
  source: "real" | "mixed" | "mock";
}

/**
 * PRD_ROZARIS_Admin_Dashboard §5.1 "Summary KPI contract" / §6.1 "KPI Row".
 * One aggregated payload so the Dashboard doesn't issue 7 separate queries
 * client-side (§5's own "must not issue dozens of unrelated client-side
 * queries" rule).
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const weekAgo = new Date(Date.now() - WEEK_MS);

  const [
    realActiveProjects,
    realNewActiveProjects,
    realActiveListings,
    realNewActiveListings,
    unitCounts,
    realPendingProjects,
    realNewPendingProjects,
    realPendingListings,
    realNewPendingListings,
  ] = await Promise.all([
    prisma.project.count({ where: { approvalStatus: "active", deletedAt: null } }),
    prisma.project.count({ where: { approvalStatus: "active", deletedAt: null, createdAt: { gte: weekAgo } } }),
    prisma.listing.count({ where: { status: "active", deletedAt: null } }),
    prisma.listing.count({ where: { status: "active", deletedAt: null, createdAt: { gte: weekAgo } } }),
    getCombinedUnitStatusCounts(),
    prisma.project.count({ where: { approvalStatus: "pending", deletedAt: null } }),
    prisma.project.count({ where: { approvalStatus: "pending", deletedAt: null, createdAt: { gte: weekAgo } } }),
    prisma.listing.count({ where: { status: "pending", deletedAt: null } }),
    prisma.listing.count({ where: { status: "pending", deletedAt: null, createdAt: { gte: weekAgo } } }),
  ]);

  // The seeded moderation queue (ModerationTab.tsx) is session-local demo
  // data with no backing table — replicated here (same three targets, same
  // filter) purely so the KPI and the tab it links to always agree. See
  // that component's doc comment for why a real Reports/Flags pipeline
  // doesn't exist yet.
  const reportsFlagsCount = [mockListings[2], mockListings[5], mockProjects[1]].filter(Boolean).length;

  const summary: Record<string, KpiValue> = {
    projectsLive: {
      value: mockProjects.length + realActiveProjects,
      newThisWeek: realNewActiveProjects,
      source: "mixed",
    },
    listingsLive: {
      value: mockListings.length + realActiveListings,
      newThisWeek: realNewActiveListings,
      source: "mixed",
    },
    unitsAvailable: { value: unitCounts.available, newThisWeek: null, source: "mixed" },
    unitsReserved: { value: unitCounts.reserved, newThisWeek: null, source: "mixed" },
    unitsSold: { value: unitCounts.sold, newThisWeek: null, source: "mixed" },
    pendingApprovals: {
      value: realPendingProjects + realPendingListings,
      newThisWeek: realNewPendingProjects + realNewPendingListings,
      source: "real",
    },
    reportsFlags: { value: reportsFlagsCount, newThisWeek: null, source: "mock" },
  };

  return NextResponse.json(summary);
}
