import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { publishers as mockPublishers } from "@/lib/mockData";

/**
 * PRD_ROZARIS_Admin_Dashboard §9 "Publisher Health & Verification" —
 * counts combine the seeded publisher directory (`lib/mockData.ts`,
 * treated as already-established/verified accounts, same convention as
 * PublishersTab.tsx) with real Publisher rows (the actual sign-up path).
 * The seeded publishers have no `restricted` field (mock type doesn't
 * model it), so "Suspended" is real-only — an honest count, not a bug.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const realPublishers = await prisma.publisher.findMany({
    where: { deletedAt: null },
    select: { verified: true, restricted: true },
  });

  const mockVerified = mockPublishers.filter((p) => p.verified).length;
  const realVerified = realPublishers.filter((p) => p.verified).length;
  const realSuspended = realPublishers.filter((p) => p.restricted).length;
  const mockPending = mockPublishers.filter((p) => !p.verified).length;
  const realPending = realPublishers.filter((p) => !p.verified && !p.restricted).length;

  return NextResponse.json({
    total: mockPublishers.length + realPublishers.length,
    verified: mockVerified + realVerified,
    pendingVerification: mockPending + realPending,
    suspended: realSuspended,
  });
}
