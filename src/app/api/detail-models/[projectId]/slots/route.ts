import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const createSlotSchema = z.object({
  name: z.string().min(1).max(60),
});

/**
 * Multiple Detail-Model Slots pass — a project's named containers for
 * independent detail GLBs (e.g. "Building", "Surroundings"), each with
 * its own full draft/publish/rollback/version history underneath
 * (`.../slots/[slotId]/versions`). Every project that had a detail model
 * before this existed already has a real "Building" slot
 * (scripts/migrate-detail-model-slots.ts backfilled it) — this route
 * just adds the ability to create more.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const slots = await prisma.detailModelSlot.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(slots);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = createSlotSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.deletedAt) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const existingCount = await prisma.detailModelSlot.count({ where: { projectId } });
  const slot = await prisma.detailModelSlot.create({
    data: { projectId, name: parsed.data.name, order: existingCount },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Detail model slot created",
    entityType: "DetailModelSlot",
    entityId: slot.id,
    entityLabel: `${project.name} · ${slot.name}`,
  });

  return NextResponse.json(slot);
}
