import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FEATURE_FLAGS, type FeatureFlagKey } from "@/lib/featureFlags";

export async function GET() {
  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
  const flags: Record<string, boolean> = {};
  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
    flags[key] = byKey.get(key) ?? true;
  }
  return NextResponse.json(flags);
}
