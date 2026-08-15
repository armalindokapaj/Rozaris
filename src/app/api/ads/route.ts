import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/featureFlags";

/** Public front-page banner slots — only enabled ones, no auth (same
 * convention as every other public GET in this app). Gated by the
 * `ads_banner` feature flag: off means the strip disappears entirely
 * rather than each caller having to know to hide it. */
export async function GET() {
  if (!(await isFeatureEnabled("ads_banner"))) {
    return NextResponse.json([]);
  }
  const rows = await prisma.advertisement.findMany({
    where: { enabled: true },
    select: { id: true, position: true, title: true, imageUrl: true, linkUrl: true },
  });
  return NextResponse.json(rows);
}
