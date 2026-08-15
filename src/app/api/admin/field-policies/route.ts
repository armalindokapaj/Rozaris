import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { FIELD_POLICIES, type FieldPolicyKey } from "@/lib/fieldPolicies";

/** Admin's "Account & Profile Fields" list — every declared key in
 * `FIELD_POLICIES`, merged with its DB override row if one exists yet (a
 * field never toggled reads as its registry default). Mirrors
 * `GET /api/admin/feature-flags` exactly. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.fieldPolicy.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const merged = (Object.keys(FIELD_POLICIES) as FieldPolicyKey[]).map((key) => {
    const def = FIELD_POLICIES[key];
    const row = byKey.get(key);
    return {
      key,
      scope: def.scope,
      label: def.label,
      required: row?.required ?? def.defaultRequired,
      isOverridden: row != null,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
  return NextResponse.json(merged);
}

const bodySchema = z.object({
  key: z.string().min(1),
  required: z.boolean(),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!(parsed.data.key in FIELD_POLICIES)) {
    return NextResponse.json({ error: "Unknown field policy key." }, { status: 400 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const def = FIELD_POLICIES[parsed.data.key as FieldPolicyKey];
  const row = await prisma.fieldPolicy.upsert({
    where: { key: parsed.data.key },
    create: { key: parsed.data.key, required: parsed.data.required, updatedBy: actor },
    update: { required: parsed.data.required, updatedBy: actor },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: `Field policy "${def.label}" (${def.scope}) → ${parsed.data.required ? "Must fill" : "Only by choice"}`,
    entityType: "FieldPolicy",
    entityId: parsed.data.key,
    entityLabel: def.label,
    newState: row,
  });

  return NextResponse.json(row);
}
