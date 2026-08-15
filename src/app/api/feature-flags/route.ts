import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FEATURE_FLAGS, type FeatureFlagKey } from "@/lib/featureFlags";

/** Public, read-only — the small set of flags a client component needs to
 * know about to gate its own render (e.g. the staleness nudge banner).
 * No auth: these are UI toggles, not secrets. Fail-open per key, same
 * rule as `isFeatureEnabled()`. */
export async function GET() {
  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
  const flags: Record<string, boolean> = {};
  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
    flags[key] = byKey.get(key) ?? true;
  }
  return NextResponse.json(flags);
}
