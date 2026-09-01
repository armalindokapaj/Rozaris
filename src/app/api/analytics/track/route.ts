import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  entityType: z.enum(["listing", "project", "ad"]),
  entityId: z.string().min(1),
  eventType: z.enum(["view", "whatsapp_click", "call_click", "impression", "click"]),
});

const LEAD_SOURCE_BY_EVENT: Partial<Record<z.infer<typeof bodySchema>["eventType"], string>> = {
  whatsapp_click: "whatsapp_click",
  call_click: "phone_click",
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await prisma.analyticsEvent.create({ data: parsed.data });
  } catch {
  }

  const leadSource = LEAD_SOURCE_BY_EVENT[parsed.data.eventType];
  if (leadSource && (parsed.data.entityType === "listing" || parsed.data.entityType === "project")) {
    try {
      const publisherId =
        parsed.data.entityType === "listing"
          ? (await prisma.listing.findUnique({ where: { id: parsed.data.entityId }, select: { publisherId: true } }))?.publisherId
          : (await prisma.project.findUnique({ where: { id: parsed.data.entityId }, select: { publisherId: true } }))?.publisherId;
      if (publisherId) {
        await prisma.leadItem.create({
          data: {
            publisherId,
            source: leadSource,
            ...(parsed.data.entityType === "listing"
              ? { listingId: parsed.data.entityId }
              : { projectId: parsed.data.entityId }),
          },
        });
      }
    } catch {
    }
  }

  return NextResponse.json({ ok: true });
}
