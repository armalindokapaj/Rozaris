import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { AD_CATEGORIES, AD_DEVICES } from "@/app/api/admin/ads/route";

/** Public ad banner slots — only enabled ones, no auth (same convention as
 * every other public GET in this app). Gated by the `ads_banner` feature
 * flag: off means every strip disappears entirely rather than each caller
 * having to know to hide it.
 *
 * `?category=front_page|search_page&device=mobile|desktop` filters down to
 * one placement's 3 slots (positions are `${category}_${device}_banner_${n}`,
 * see the admin ads route) — every real surface passes both; omitting them
 * returns every enabled ad across all 4 placements. */
export async function GET(request: Request) {
  if (!(await isFeatureEnabled("ads_banner"))) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const device = searchParams.get("device");

  const positionFilter =
    category && device && AD_CATEGORIES.includes(category as (typeof AD_CATEGORIES)[number]) && AD_DEVICES.includes(device as (typeof AD_DEVICES)[number])
      ? { startsWith: `${category}_${device}_banner_` }
      : undefined;

  const rows = await prisma.advertisement.findMany({
    where: { enabled: true, ...(positionFilter ? { position: positionFilter } : {}) },
    select: { id: true, position: true, title: true, imageUrl: true, linkUrl: true },
  });
  return NextResponse.json(rows);
}
