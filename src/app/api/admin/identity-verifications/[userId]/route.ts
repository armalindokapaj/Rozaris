import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const bodySchema = z.object({
  decision: z.enum(["verified", "failed"]),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { userId } = await params;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.decision === "failed" && !parsed.data.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required to reject." }, { status: 400 });
  }

  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before || before.identityVerificationStatus !== "pending") {
    return NextResponse.json({ error: "No pending request for this account." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      identityVerificationStatus: parsed.data.decision,
      identityReviewedAt: new Date(),
      identityReviewedBy: actor,
      identityRejectionReason: parsed.data.decision === "failed" ? parsed.data.reason : null,
    },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: `Identity verification ${parsed.data.decision === "verified" ? "approved" : "rejected"}`,
    entityType: "User",
    entityId: userId,
    entityLabel: before.name,
    reason: parsed.data.reason,
    previousState: { identityVerificationStatus: before.identityVerificationStatus },
    newState: { identityVerificationStatus: updated.identityVerificationStatus },
  });

  return NextResponse.json({ ok: true });
}
