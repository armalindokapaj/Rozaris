import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { expires: "desc" },
    select: { id: true, expires: true },
  });

  return NextResponse.json({ sessions, strategy: "jwt" });
}

const bodySchema = z.object({ sessionId: z.string().min(1) });

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const parsed = bodySchema.safeParse({ sessionId: searchParams.get("sessionId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });
  }

  const row = await prisma.session.findUnique({ where: { id: parsed.data.sessionId } });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  await prisma.session.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
