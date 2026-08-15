import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePublisherSession } from "@/lib/publisherAuth";

/**
 * The signed-in publisher's real lead inbox (PRD_ROZARIS_User_Types §4
 * "Leads") — real `LeadItem` rows, produced by `POST /api/analytics/track`
 * on a real phone/WhatsApp click (see that route). Replaces the Leads
 * tab's `buildDemoLeads()`, which fabricated a fresh batch every session
 * — see the launch-readiness audit that found this. Any team member can
 * read (same convention as `/api/business/organization` GET); only
 * `PATCH /api/business/leads/[id]` needs a role check, and doesn't even
 * need one beyond "is on this team" since status/notes triage is
 * everyone's job here, not just Owner/Org Admin's.
 */
export async function GET() {
  const gate = await requirePublisherSession();
  if (gate instanceof NextResponse) return gate;
  if (!gate.user?.publisherId) {
    return NextResponse.json({ error: "No organization for this session." }, { status: 400 });
  }

  const leads = await prisma.leadItem.findMany({
    where: { publisherId: gate.user.publisherId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, slug: true } },
      project: { select: { id: true, name: true, slug: true } },
    },
  });
  return NextResponse.json(leads);
}
