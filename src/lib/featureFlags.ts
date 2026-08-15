import { prisma } from "@/lib/db";

/**
 * Real, DB-backed feature flags (Platform Settings' "Feature Flags" —
 * see `FeatureFlag` in prisma/schema.prisma for the full contract). Each
 * flag here is checked by at least one real code path — this file is
 * deliberately not a place to declare a flag "for later" with nothing
 * behind it.
 */
export const FEATURE_FLAGS = {
  /** Gates whether `<AdBannerStrip>` renders on the front page at all —
   * checked in `src/app/(site)/page.tsx`. */
  ads_banner: "Front-page ad banners",
  /** Gates the "location drop" rule (`POST /api/listings`): when off, a
   * listing without a confirmed pin still goes straight to `pending`
   * instead of falling into `draft`. */
  location_drop_required: "Require a confirmed map pin before review",
  /** Gates the >90-day staleness nudge on the publisher dashboard and the
   * new-listing form (`src/lib/moderation.ts`'s `isListingStale`). */
  listing_staleness_nudge: "Listing staleness reminders",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/** Fail-open by design: a flag that's missing from the table (never
 * toggled, or a key that predates this file) behaves as enabled — the
 * flags table is an override mechanism, not a gate that can silently
 * disable a code path just by not having a row yet. */
export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  return row?.enabled ?? true;
}
