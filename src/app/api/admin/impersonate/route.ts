import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireSuperAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import {
  createImpersonationCookieValue,
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonationCookieValue,
} from "@/lib/impersonation";

/** Current impersonation state, for `ImpersonationBanner.tsx` — any admin
 * can read (it only reveals something if a cookie is already set on their
 * own request). */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const jar = await cookies();
  const targetUserId = verifyImpersonationCookieValue(jar.get(IMPERSONATION_COOKIE_NAME)?.value);
  if (!targetUserId) return NextResponse.json({ active: false });

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return NextResponse.json({ active: false });
  return NextResponse.json({ active: true, target: { id: target.id, name: target.name, email: target.email } });
}

const bodySchema = z.object({ targetUserId: z.string().min(1) });

/** Starts view-only impersonation — Super Admin only. See
 * `src/lib/impersonation.ts`'s doc comment for the real, honestly-scoped
 * blast radius. */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { targetUserId } = parsed.data;
  if (targetUserId === gate.user?.id) {
    return NextResponse.json({ error: "You're already yourself." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || target.deletedAt) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { value, maxAge } = createImpersonationCookieValue(targetUserId);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Started impersonation (view-only)",
    entityType: "User",
    entityId: targetUserId,
    entityLabel: target.name,
  });

  return NextResponse.json({ active: true, target: { id: target.id, name: target.name, email: target.email } });
}

/** Ends impersonation — any admin can end their own, no target lookup
 * needed. */
export async function DELETE() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const jar = await cookies();
  const targetUserId = verifyImpersonationCookieValue(jar.get(IMPERSONATION_COOKIE_NAME)?.value);
  jar.delete(IMPERSONATION_COOKIE_NAME);

  if (targetUserId) {
    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Ended impersonation",
      entityType: "User",
      entityId: targetUserId,
    });
  }

  return NextResponse.json({ ok: true });
}
