import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const createSlotSchema = z.object({
  name: z.string().min(1).max(60),
  role: z.enum(["building", "units", "surroundings", "context", "custom"]).optional(),
});

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
