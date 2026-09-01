import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { FEATURE_FLAGS, type FeatureFlagKey } from "@/lib/featureFlags";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.featureFlag.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const merged = (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).map((key) => {
    const row = byKey.get(key);
    return {
      key,
      description: FEATURE_FLAGS[key],
      enabled: row?.enabled ?? true,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
  return NextResponse.json(merged);
}

const bodySchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(parsed.data.key in FEATURE_FLAGS)) {
    return NextResponse.json({ error: "Unknown feature flag." }, { status: 400 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const row = await prisma.featureFlag.upsert({
    where: { key: parsed.data.key },
    create: {
      key: parsed.data.key,
      enabled: parsed.data.enabled,
      description: FEATURE_FLAGS[parsed.data.key as FeatureFlagKey],
      updatedBy: actor,
    },
    update: { enabled: parsed.data.enabled, updatedBy: actor },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: `Feature flag "${parsed.data.key}" → ${parsed.data.enabled ? "on" : "off"}`,
    entityType: "FeatureFlag",
    entityId: parsed.data.key,
    entityLabel: FEATURE_FLAGS[parsed.data.key as FeatureFlagKey],
    newState: row,
  });

  return NextResponse.json(row);
}
