import { prisma } from "@/lib/db";

export const FEATURE_FLAGS = {
  ads_banner: "Ad banners (Front Page + Search Page)",
  location_drop_required: "Require a confirmed map pin before review",
  listing_staleness_nudge: "Listing staleness reminders",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  return row?.enabled ?? true;
}
