import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

export const AD_CATEGORIES = ["front_page", "search_page"] as const;
export const AD_DEVICES = ["mobile", "desktop"] as const;
const SLOTS_PER_GROUP = 3;

export const AD_POSITIONS = AD_CATEGORIES.flatMap((category) =>
  AD_DEVICES.flatMap((device) =>
    Array.from({ length: SLOTS_PER_GROUP }, (_, i) => `${category}_${device}_banner_${i + 1}` as const)
  )
);

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.advertisement.findMany({ where: { position: { in: [...AD_POSITIONS] } } });
  const byPosition = new Map(rows.map((r) => [r.position, r]));
  return NextResponse.json(AD_POSITIONS.map((position) => byPosition.get(position) ?? { position, id: null }));
}

const bodySchema = z.object({
  position: z.enum(AD_POSITIONS as [string, ...string[]]),
  title: z.string().min(1),
  imageUrl: z.string().min(1),
  linkUrl: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { position, ...data } = parsed.data;
  const ad = await prisma.advertisement.upsert({
    where: { position },
    update: data,
    create: { position, ...data },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action: `Ad banner "${position}" updated`,
    entityType: "Advertisement",
    entityId: ad.id,
    entityLabel: ad.title,
    newState: ad,
  });

  return NextResponse.json(ad);
}
