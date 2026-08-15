import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const row = await prisma.searchRankingConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  return NextResponse.json(row);
}

const bodySchema = z.object({
  premiumWeight: z.number().int().min(-100).max(100),
  freshListingWeight: z.number().int().min(-100).max(100),
  verifiedPublisherWeight: z.number().int().min(-100).max(100),
  completeInfoWeight: z.number().int().min(-100).max(100),
  threeDProjectWeight: z.number().int().min(-100).max(100),
  poorDataWeight: z.number().int().min(-100).max(100),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const row = await prisma.searchRankingConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data, updatedBy: actor },
    update: { ...parsed.data, updatedBy: actor },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Search ranking weights updated",
    entityType: "SearchRankingConfig",
    entityId: "default",
    newState: row,
  });

  return NextResponse.json(row);
}
