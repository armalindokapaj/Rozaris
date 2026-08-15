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
  return NextResponse.json({ ok: true });
}
