import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { FollowKind } from "@/generated/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const rows = await prisma.follow.findMany({ where: { userId: session.user.id } });
  const grouped = { projects: [] as string[], developers: [] as string[] };
  for (const row of rows) {
    if (row.kind === "project") grouped.projects.push(row.targetId);
    else grouped.developers.push(row.targetId);
  }
  return NextResponse.json(grouped);
}

const bodySchema = z.object({
  kind: z.enum(["project", "developer"]),
  targetId: z.string().min(1),
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
  const { kind, targetId } = parsed.data;
  const where = {
    userId_kind_targetId: { userId: session.user.id, kind: kind as FollowKind, targetId },
  };
  const existing = await prisma.follow.findUnique({ where });
  if (existing) {
    await prisma.follow.delete({ where });
    return NextResponse.json({ following: false });
  }
  await prisma.follow.create({ data: { userId: session.user.id, kind: kind as FollowKind, targetId } });
  return NextResponse.json({ following: true });
}
