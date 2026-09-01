import type { Listing } from "@/lib/types";

export interface SearchRankingWeights {
  premiumWeight: number;
  freshListingWeight: number;
  verifiedPublisherWeight: number;
  completeInfoWeight: number;
  threeDProjectWeight: number;
  poorDataWeight: number;
}

export const DEFAULT_SEARCH_RANKING_WEIGHTS: SearchRankingWeights = {
  premiumWeight: 30,
  freshListingWeight: 8,
  verifiedPublisherWeight: 10,
  completeInfoWeight: 5,
  threeDProjectWeight: 6,
  poorDataWeight: -10,
};

const FRESH_LISTING_DAYS = 14;

function hasCompleteInfo(listing: Listing): boolean {
  return listing.images.length >= 3 && listing.description.en.trim().length >= 40 && listing.amenities.length > 0;
}

function hasPoorData(listing: Listing): boolean {
  return listing.images.length === 0 || listing.description.en.trim().length < 20;
}

export function computeRankScore(listing: Listing, weights: SearchRankingWeights): number {
  let score = 0;
  if (listing.premium) score += weights.premiumWeight;
  const ageDays = (Date.now() - new Date(listing.createdAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= FRESH_LISTING_DAYS) score += weights.freshListingWeight;
  if (listing.publisher.verified) score += weights.verifiedPublisherWeight;
  if (hasCompleteInfo(listing)) score += weights.completeInfoWeight;
  if (listing.fromProjectSlug) score += weights.threeDProjectWeight;
  if (hasPoorData(listing)) score += weights.poorDataWeight;
  return score;
}
