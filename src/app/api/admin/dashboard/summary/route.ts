import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { projects as mockProjects, listings as mockListings } from "@/lib/mockData";
import { getCombinedUnitStatusCounts } from "@/lib/adminInventory";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface KpiValue {
  value: number;
  newThisWeek: number | null;
  source: "real" | "mixed" | "mock";
}

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

  const reportsFlagsCount = [mockListings[2], mockListings[5], mockProjects[1]].filter(Boolean).length;

  const summary: Record<string, KpiValue> = {
    projectsLive: {
      value: realActiveProjects,
      newThisWeek: realNewActiveProjects,
      source: "real",
    },
    listingsLive: {
      value: realActiveListings,
      newThisWeek: realNewActiveListings,
      source: "real",
    },
    unitsAvailable: { value: unitCounts.available, newThisWeek: null, source: "real" },
    unitsReserved: { value: unitCounts.reserved, newThisWeek: null, source: "real" },
    unitsSold: { value: unitCounts.sold, newThisWeek: null, source: "real" },
    pendingApprovals: {
      value: realPendingProjects + realPendingListings,
      newThisWeek: realNewPendingProjects + realNewPendingListings,
      source: "real",
    },
    reportsFlags: { value: reportsFlagsCount, newThisWeek: null, source: "mock" },
  };

  return NextResponse.json(summary);
}
