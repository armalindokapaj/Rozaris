import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { AD_CATEGORIES, AD_DEVICES } from "@/app/api/admin/ads/route";

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
