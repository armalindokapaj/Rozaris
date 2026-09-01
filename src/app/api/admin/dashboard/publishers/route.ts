import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { publishers as mockPublishers } from "@/lib/mockData";

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
