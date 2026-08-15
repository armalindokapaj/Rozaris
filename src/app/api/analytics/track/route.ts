import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  entityType: z.enum(["listing", "project", "ad"]),
  entityId: z.string().min(1),
  eventType: z.enum(["view", "whatsapp_click", "call_click", "impression", "click"]),
});

/**
 * Fire-and-forget analytics event logging (`AnalyticsEvent`, see the
 * "Rozaris Platform Audit" memory) — one shared endpoint for both content
 * (Listing/Project view + WhatsApp/call clicks, visible to that post's
 * owner and Admin) and Advertisement impression/click tracking, rather
 * than two near-identical routes. Deliberately ungated (any visitor
 * triggers these, including anonymous ones — that's the point of view
 * tracking) and deliberately never throws back at the caller in a way
 * that would surface to a real user; a dropped analytics event should
 * never break the page that reported it.
 */
/** Which real `LeadItem.source` a click-tracking event maps onto — only
 * `whatsapp_click`/`call_click` are real buyer-intent signals worth a
 * lead row; a bare `view` isn't. `listing_inquiry`/`digital_twin_inquiry`
 * (see `LeadSource` in `src/lib/types.ts`) have no real producer yet — no
 * real buyer-inquiry-form or 3D-engagement write path exists in this app
 * today, so those sources are honestly never produced rather than faked.
 * See the launch-readiness audit that found the old Leads tab was 100%
 * mock. */
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
    // Best-effort — see doc comment above.
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
      // Best-effort — a dropped lead should never break the click it came from.
    }
  }

  return NextResponse.json({ ok: true });
}
