import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

export const AD_POSITIONS = ["front_page_banner_1", "front_page_banner_2", "front_page_banner_3"] as const;

/** Every ad slot, one row per position (including empty/unconfigured ones
 * as `null`) — the admin Advertising tab always shows exactly 3 rows to
 * fill in, matching "3 banners" (see the "Rozaris Platform Audit" memory),
 * not however many happen to exist in the table yet. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.advertisement.findMany({ where: { position: { in: [...AD_POSITIONS] } } });
  const byPosition = new Map(rows.map((r) => [r.position, r]));
  return NextResponse.json(AD_POSITIONS.map((position) => byPosition.get(position) ?? { position, id: null }));
}

const bodySchema = z.object({
  position: z.enum(AD_POSITIONS),
  title: z.string().min(1),
  imageUrl: z.string().min(1),
  linkUrl: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

/** Upsert-by-position — a save always targets one of the 3 fixed slots. */
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
