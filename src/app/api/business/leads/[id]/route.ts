import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePublisherSession } from "@/lib/publisherAuth";

const LEAD_STATUSES = ["new", "contacted", "qualified", "viewing", "negotiating", "won", "lost"] as const;

const bodySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.leadItem.findUnique({ where: { id } });
  if (!existing || existing.publisherId !== gate.user.publisherId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const updated = await prisma.leadItem.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}
