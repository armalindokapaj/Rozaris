import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const createSlotSchema = z.object({
  name: z.string().min(1).max(60),
  // Units Blocks & POI Layer PRD §2 — optional so every existing caller
  // (the "Building"/+Add slot pills) keeps working unchanged; defaults to
  // "custom", same as the column's own DB default.
  role: z.enum(["building", "units", "surroundings", "context", "custom"]).optional(),
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

  // Units Blocks & POI Layer PRD §3 — a new `role: "units"` slot normally
  // inherits the project's Building slot's transform automatically, so an
  // admin never has to remember to wire this up by hand. Only auto-set
  // when the project actually has exactly one `role: "building"` slot —
  // if there's none yet (unusual ordering) or more than one (ambiguous),
  // leave it null; the admin can still set it explicitly via PATCH.
  let transformParentSlotId: string | null = null;
  if (parsed.data.role === "units") {
    const buildingSlots = await prisma.detailModelSlot.findMany({ where: { projectId, role: "building" }, select: { id: true } });
    if (buildingSlots.length === 1) transformParentSlotId = buildingSlots[0].id;
  }

  const slot = await prisma.detailModelSlot.create({
    data: { projectId, name: parsed.data.name, order: existingCount, role: parsed.data.role ?? "custom", transformParentSlotId },
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
