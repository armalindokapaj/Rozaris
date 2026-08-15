import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const bodySchema = z.object({
  status: z.enum(["actioned", "dismissed"]),
  resolution: z.string().optional(),
});

/** Resolve a moderation report — "actioned" (something real was done
 * about it, typically via Listings/Project Control separately — this
 * route doesn't itself touch the reported listing/project) or
 * "dismissed" (no action needed). Either way the report is kept, not
 * deleted, so it stays in the audit trail. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { reportId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.moderationReport.findUnique({ where: { id: reportId } });
  if (!existing) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  const updated = await prisma.moderationReport.update({
    where: { id: reportId },
    data: {
      status: parsed.data.status,
      resolvedAt: new Date(),
      resolvedBy: actor,
      resolution: parsed.data.resolution,
    },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: `Moderation report ${parsed.data.status}`,
    entityType: "ModerationReport",
    entityId: reportId,
    entityLabel: `${existing.entityType} ${existing.entityId}`,
    reason: parsed.data.resolution,
    previousState: existing,
    newState: updated,
  });

  return NextResponse.json(updated);
}
