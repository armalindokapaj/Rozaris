import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePublisherSession } from "@/lib/publisherAuth";

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
