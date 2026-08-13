import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const patchSchema = z.object({
  verified: z.boolean().optional(),
  restricted: z.boolean().optional(),
  restrictedReason: z.string().optional(),
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
    const updated = await prisma.publisher.update({ where: { id: publisherId }, data: parsed.data });

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    const action =
      parsed.data.verified !== undefined
        ? parsed.data.verified
          ? "Publisher verified"
          : "Publisher verification removed"
        : parsed.data.restricted
          ? "Publisher restricted"
          : "Publisher unrestricted";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action,
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
