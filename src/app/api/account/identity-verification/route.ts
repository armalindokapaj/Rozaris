import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

/**
 * Account & Profile System PRD v1.0 §9 "Verification & Trust — Identity" —
 * real self-service request + real admin manual review (see
 * `/api/admin/identity-verifications`), not automated document
 * verification (no KYC provider in this environment — same constraint
 * noted on phone OTP in src/auth.ts). Requesting it is what unlocks the
 * "Verified Publisher" badge for a Private Publisher (§6.3), but any
 * signed-in account can request it.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      identityVerificationStatus: true,
      identitySubmittedAt: true,
      identityReviewedAt: true,
      identityRejectionReason: true,
      identityNote: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(user);
}

const bodySchema = z.object({ note: z.string().trim().max(1000).optional() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (before.identityVerificationStatus === "pending" || before.identityVerificationStatus === "verified") {
    return NextResponse.json({ error: "A request is already pending or already verified." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      identityVerificationStatus: "pending",
      identitySubmittedAt: new Date(),
      identityRejectionReason: null,
      identityNote: parsed.data.note ?? before.identityNote,
    },
  });

  await logAuditEvent({
    actor: session.user.email ?? session.user.name ?? "self",
    actorId: session.user.id,
    action: "Identity verification requested",
    entityType: "User",
    entityId: session.user.id,
    previousState: { identityVerificationStatus: before.identityVerificationStatus },
    newState: { identityVerificationStatus: updated.identityVerificationStatus },
  });

  return NextResponse.json({ ok: true });
}
