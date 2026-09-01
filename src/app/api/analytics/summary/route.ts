import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export interface AnalyticsSummary {
  view: number;
  whatsapp_click: number;
  call_click: number;
  impression: number;
  click: number;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId || !["listing", "project", "ad"].includes(entityType)) {
    return NextResponse.json({ error: "entityType and entityId are required." }, { status: 400 });
  }

  const isAdmin = session.user.role === "admin";

  if (entityType === "ad" && !isAdmin) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  if (!isAdmin && entityType !== "ad") {
    const owner =
      entityType === "listing"
        ? await prisma.listing.findUnique({ where: { id: entityId }, select: { publisherId: true } })
        : await prisma.project.findUnique({ where: { id: entityId }, select: { publisherId: true } });
    if (!owner || owner.publisherId !== session.user.publisherId) {
      return NextResponse.json({ error: "You can only view analytics for your own posts." }, { status: 403 });
    }
  }

  const rows = await prisma.analyticsEvent.groupBy({
    by: ["eventType"],
    where: { entityType, entityId },
    _count: { _all: true },
  });

  const summary: AnalyticsSummary = { view: 0, whatsapp_click: 0, call_click: 0, impression: 0, click: 0 };
  for (const row of rows) {
    if (row.eventType in summary) summary[row.eventType as keyof AnalyticsSummary] = row._count._all;
  }

  return NextResponse.json(summary);
}
