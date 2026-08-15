import type { Listing } from "@/lib/types";

/** Matches `SearchRankingConfig`'s columns minus the audit fields — the
 * shape both `GET /api/search-ranking` (public) and the admin editor pass
 * around. */
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

/** "Complete information" — a real, checkable minimum: at least 3 photos,
 * a real (non-trivial) description, and at least one amenity tagged.
 * Anything short of that also trips the "poor data" penalty below (the
 * two are independent factors, both can apply to the same listing). */
function hasCompleteInfo(listing: Listing): boolean {
  return listing.images.length >= 3 && listing.description.en.trim().length >= 40 && listing.amenities.length > 0;
}

function hasPoorData(listing: Listing): boolean {
  return listing.images.length === 0 || listing.description.en.trim().length < 20;
}

/**
 * Search Engine Control's real ranking score — every factor is a real,
 * computable signal off the actual `Listing`/`Publisher` row, matching
 * the weights an admin sets in Platform Settings → Search
 * (`GET /api/search-ranking`). Used only for the "recommended" sort;
 * every other sort (price/area/newest) stays a direct field comparison,
 * untouched by this.
 */
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
