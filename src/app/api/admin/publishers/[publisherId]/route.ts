import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  whatsapp: z.string().optional(),
  bio: z.string().optional(),
  verified: z.boolean().optional(),
  verificationStatus: z.enum(["not_submitted", "pending", "verified", "rejected", "reverify_required"]).optional(),
  verificationRejectionReason: z.string().max(500).optional(),
  developerStatus: z.enum(["not_applicable", "pending", "verified"]).optional(),
  restricted: z.boolean().optional(),
  restrictedReason: z.string().optional(),
  restrictedDays: z.number().int().min(0).max(365).optional(),
  newOwnerPassword: z.string().min(4).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ publisherId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { publisherId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.restricted === true && !parsed.data.restrictedReason?.trim()) {
    return NextResponse.json({ error: "A reason is required to restrict a publisher." }, { status: 400 });
  }

  const existing = await prisma.publisher.findUnique({ where: { id: publisherId } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Publisher not found." }, { status: 404 });
  }

  try {
    const { restrictedDays, newOwnerPassword, verified, verificationStatus, developerStatus, ...fields } =
      parsed.data;
    const data: Record<string, unknown> = { ...fields };
    const actor = gate.user?.email ?? gate.user?.name ?? "admin";

    let nextVerificationStatus = existing.verificationStatus;
    if (verificationStatus !== undefined) {
      nextVerificationStatus = verificationStatus;
      data.verificationStatus = verificationStatus;
      data.verificationRejectionReason = verificationStatus === "rejected" ? parsed.data.verificationRejectionReason ?? null : null;
      if (verificationStatus === "verified" || verificationStatus === "rejected") {
        data.verificationReviewedAt = new Date();
        data.verificationReviewedBy = actor;
      }
    } else if (verified !== undefined) {
      nextVerificationStatus = verified ? "verified" : existing.verificationStatus === "verified" ? "not_submitted" : existing.verificationStatus;
      data.verificationStatus = nextVerificationStatus;
      if (verified) {
        data.verificationReviewedAt = new Date();
        data.verificationReviewedBy = actor;
      }
    }
    let nextDeveloperStatus = existing.developerStatus;
    if (developerStatus !== undefined) {
      nextDeveloperStatus = developerStatus;
      data.developerStatus = developerStatus;
    }
    if (verificationStatus !== undefined || verified !== undefined || developerStatus !== undefined) {
      data.verified = nextVerificationStatus === "verified" || nextDeveloperStatus === "verified";
    }

    if (parsed.data.restricted !== undefined) {
      data.restrictedUntil = parsed.data.restricted && restrictedDays ? new Date(Date.now() + restrictedDays * 24 * 60 * 60 * 1000) : null;
    }
    if (newOwnerPassword) {
      await prisma.user.update({
        where: { id: existing.ownerUserId },
        data: { passwordHash: await bcrypt.hash(newOwnerPassword, 10) },
      });
    }

    const updated = await prisma.publisher.update({ where: { id: publisherId }, data });

    const actions: string[] = [];
    if (fields.name) actions.push("Name updated");
    if (verificationStatus !== undefined) actions.push(`Business verification → ${verificationStatus}`);
    else if (verified !== undefined) actions.push(verified ? "Publisher verified" : "Publisher verification removed");
    if (developerStatus !== undefined) actions.push(`Developer status → ${developerStatus}`);
    if (parsed.data.restricted !== undefined) {
      actions.push(
        parsed.data.restricted
          ? `Publisher restricted${restrictedDays ? ` (${restrictedDays}d)` : ""}`
          : "Publisher unrestricted"
      );
    }
    if (newOwnerPassword) actions.push("Owner password reset by admin");

    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: actions.join("; ") || "Publisher updated",
      entityType: "Publisher",
      entityId: publisherId,
      entityLabel: existing.name,
      reason: parsed.data.restrictedReason,
      previousState: existing,
      newState: updated,
    });

    return NextResponse.json(updated);
  } catch (err) {
    await logApiError(`/api/admin/publishers/${publisherId}`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
