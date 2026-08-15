import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const MAX_ENTRIES = 24;

/** §4 "Recently Viewed — Private browsing history with clear deletion
 * controls" — real `RecentlyViewedEntry` rows, newest first, capped. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const rows = await prisma.recentlyViewedEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { viewedAt: "desc" },
    take: MAX_ENTRIES,
    select: { kind: true, entityId: true, viewedAt: true },
  });
  return NextResponse.json(rows.map((r) => ({ kind: r.kind, id: r.entityId, viewedAt: r.viewedAt })));
}

const bodySchema = z.object({
  kind: z.enum(["listing", "project"]),
  entityId: z.string().min(1),
});

/** Upserts one entry to "now", then trims the account down to
 * `MAX_ENTRIES` — same bound the old client-only slice enforced. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { kind, entityId } = parsed.data;
  await prisma.recentlyViewedEntry.upsert({
    where: { userId_kind_entityId: { userId: session.user.id, kind, entityId } },
    create: { userId: session.user.id, kind, entityId },
    update: { viewedAt: new Date() },
  });

  const overflow = await prisma.recentlyViewedEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { viewedAt: "desc" },
    skip: MAX_ENTRIES,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.recentlyViewedEntry.deleteMany({ where: { id: { in: overflow.map((o) => o.id) } } });
  }
  return NextResponse.json({ ok: true });
}

/** No query params clears the whole history; `kind`+`entityId` removes one
 * entry. */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const entityId = searchParams.get("entityId");

  if (!kind && !entityId) {
    await prisma.recentlyViewedEntry.deleteMany({ where: { userId: session.user.id } });
    return NextResponse.json({ ok: true });
  }
  if (kind !== "listing" && kind !== "project") {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId required." }, { status: 400 });
  }
  await prisma.recentlyViewedEntry.deleteMany({ where: { userId: session.user.id, kind, entityId } });
  return NextResponse.json({ ok: true });
}
