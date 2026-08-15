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
  /// Legacy simple toggle, still accepted — derives `verificationStatus`
  /// (below) rather than being written raw, so the two fields can never
  /// disagree (§9.2 "cannot self-select a verified badge" applies to admin
  /// UI drift too, not just client requests).
  verified: z.boolean().optional(),
  /// Account & Profile System PRD v1.0 §9 "Business" verification —
  /// real reviewed state, distinct from the bare `verified` toggle above.
  verificationStatus: z.enum(["not_submitted", "pending", "verified", "rejected", "reverify_required"]).optional(),
  verificationRejectionReason: z.string().max(500).optional(),
  /// §9.1 "Developer status" — separate dimension, only meaningful for
  /// `type: developer`.
  developerStatus: z.enum(["not_applicable", "pending", "verified"]).optional(),
  restricted: z.boolean().optional(),
  restrictedReason: z.string().optional(),
  /// Time-bound restriction (see the "Rozaris Platform Audit" memory) —
  /// days from now `restrictedUntil` auto-lifts. `0` (or omitted) with
  /// `restricted: true` stays indefinite, same as before this field
  /// existed.
  restrictedDays: z.number().int().min(0).max(365).optional(),
  /// Admin-set password on the publisher's OWNER user account — same
  /// reasoning as `PATCH /api/admin/users/[id]`'s `newPassword`.
  newOwnerPassword: z.string().min(4).optional(),
});

/**
 * Publisher Admin actions (PRD_ROZARIS_Admin §6): "Verify / remove
 * verification" and "Restrict publishing" — both real, first-time write
 * paths for `Publisher` (previously read-only, list-only). A `restricted:
 * true` write without a `restrictedReason` is rejected — mandatory reasons
 * per the PRD's ADM-005.
 */
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

    // Reconcile the legacy `verified` toggle and the real
    // `verificationStatus`/`developerStatus` dimensions into one
    // consistent write — whichever the caller sent, `verified` always
    // ends up true iff either verification dimension is `verified`.
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
