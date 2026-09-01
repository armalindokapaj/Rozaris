import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await prisma.transaction.findMany({
    where: { status: "completed" },
    orderBy: { occurredAt: "desc" },
    take: 300,
    include: {
      listing: {
        select: {
          title: true,
          slug: true,
          property: { select: { area: true, city: true, location: { select: { officialName: true } } } },
        },
      },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      price: r.price,
      currency: r.currency,
      occurredAt: r.occurredAt,
      excludedFromStats: r.excludedFromStats,
      excludedReason: r.excludedReason,
      listingTitle: r.listing.title,
      listingSlug: r.listing.slug,
      area: r.listing.property.area,
      location: r.listing.property.location?.officialName ?? r.listing.property.city,
    }))
  );
}

const bodySchema = z.object({
  id: z.string().min(1),
  excludedFromStats: z.boolean(),
  excludedReason: z.string().optional(),
});

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.excludedFromStats && !parsed.data.excludedReason?.trim()) {
    return NextResponse.json({ error: "A reason is required to exclude a transaction." }, { status: 400 });
  }

  const existing = await prisma.transaction.findUnique({ where: { id: parsed.data.id } });
  if (!existing) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });

  const updated = await prisma.transaction.update({
    where: { id: parsed.data.id },
    data: {
      excludedFromStats: parsed.data.excludedFromStats,
      excludedReason: parsed.data.excludedFromStats ? parsed.data.excludedReason : null,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: parsed.data.excludedFromStats ? "Transaction excluded from market stats" : "Transaction re-included in market stats",
    entityType: "Transaction",
    entityId: parsed.data.id,
    reason: parsed.data.excludedReason,
    previousState: existing,
    newState: updated,
  });

  return NextResponse.json(updated);
}
