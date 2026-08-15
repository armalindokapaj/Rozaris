import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { SavedEntityType } from "@/generated/prisma";

/**
 * Account & Profile System PRD v1.0 §4 "User account home — Saved
 * Properties / Saved Projects" — real `SavedItem` rows, replacing the
 * buyer dashboard's previous local-only Zustand `saved` slice. A
 * neighborhood "save" doubles as following it (§5.2 — no separate action),
 * same convention the client already used.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const rows = await prisma.savedItem.findMany({ where: { userId: session.user.id } });
  const grouped = { listings: [] as string[], projects: [] as string[], neighborhoods: [] as string[] };
  for (const row of rows) {
    if (row.entityType === "listing") grouped.listings.push(row.entityId);
    else if (row.entityType === "project") grouped.projects.push(row.entityId);
    else grouped.neighborhoods.push(row.entityId);
  }
  return NextResponse.json(grouped);
}

const bodySchema = z.object({
  entityType: z.enum(["listing", "project", "neighborhood"]),
  entityId: z.string().min(1),
});

/** Toggles a saved item — creates it if absent, deletes it if present.
 * Returns `{ saved: boolean }` for the one item toggled. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { entityType, entityId } = parsed.data;
  const where = {
    userId_entityType_entityId: {
      userId: session.user.id,
      entityType: entityType as SavedEntityType,
      entityId,
    },
  };
  const existing = await prisma.savedItem.findUnique({ where });
  if (existing) {
    await prisma.savedItem.delete({ where });
    return NextResponse.json({ saved: false });
  }
  await prisma.savedItem.create({
    data: { userId: session.user.id, entityType: entityType as SavedEntityType, entityId },
  });
  return NextResponse.json({ saved: true });
}
