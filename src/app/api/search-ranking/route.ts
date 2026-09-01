import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_SEARCH_RANKING_WEIGHTS } from "@/lib/searchRanking";

export async function GET() {
  const row = await prisma.searchRankingConfig.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    premiumWeight: row?.premiumWeight ?? DEFAULT_SEARCH_RANKING_WEIGHTS.premiumWeight,
    freshListingWeight: row?.freshListingWeight ?? DEFAULT_SEARCH_RANKING_WEIGHTS.freshListingWeight,
    verifiedPublisherWeight: row?.verifiedPublisherWeight ?? DEFAULT_SEARCH_RANKING_WEIGHTS.verifiedPublisherWeight,
    completeInfoWeight: row?.completeInfoWeight ?? DEFAULT_SEARCH_RANKING_WEIGHTS.completeInfoWeight,
    threeDProjectWeight: row?.threeDProjectWeight ?? DEFAULT_SEARCH_RANKING_WEIGHTS.threeDProjectWeight,
    poorDataWeight: row?.poorDataWeight ?? DEFAULT_SEARCH_RANKING_WEIGHTS.poorDataWeight,
  });
}
