import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Account & Profile System PRD v1.0 §10.1 "Active sessions/devices" +
 * "Sign out all other sessions" — reads/revokes real Auth.js `Session`
 * rows for the signed-in account. Note: this app uses JWT session
 * strategy (src/auth.ts's `session: { strategy: "jwt" }`), so the
 * `sessions` table is not populated by sign-in itself; this endpoint is
 * the real data source once/if a session-token strategy or explicit
 * device-tracking rows are added. It's honest about that today — see
 * GET's `strategy` field, which the UI uses to explain an empty list
 * rather than implying no other devices exist.
 */
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

/** Revoke one session row by id (must belong to the signed-in account). */
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
