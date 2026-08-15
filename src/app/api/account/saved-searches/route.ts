import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** §4 "Saved Searches — Persist structured search criteria" — real
 * `SavedSearch` rows. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const rows = await prisma.savedSearch.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, filtersSummary: true, filters: true, cadence: true, createdAt: true },
  });
  return NextResponse.json(rows);
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  filtersSummary: z.string().trim().max(300),
  filters: z.unknown().optional(),
  cadence: z.enum(["instant", "daily", "weekly", "off"]).default("off"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const row = await prisma.savedSearch.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      filtersSummary: parsed.data.filtersSummary,
      filters: (parsed.data.filters ?? {}) as object,
      cadence: parsed.data.cadence,
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const row = await prisma.savedSearch.findUnique({ where: { id } });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  await prisma.savedSearch.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
