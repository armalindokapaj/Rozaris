import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const patchSlotSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  // Units Blocks & POI Layer PRD §2/§3 — lets the (future) Units tab
  // correct role/alignment after creation, e.g. if a slot was created
  // before its intended Building parent existed. Both optional so the
  // existing rename-only callers are unaffected.
  role: z.enum(["building", "units", "surroundings", "context", "custom"]).optional(),
  transformParentSlotId: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; slotId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, slotId } = await params;
  const parsed = patchSlotSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const slot = await prisma.detailModelSlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.projectId !== projectId) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }

  // A transform parent must be a real slot in the SAME project (and not
  // the slot itself — a self-reference would make every downstream
  // transform-inheritance read loop forever).
  if (parsed.data.transformParentSlotId) {
    if (parsed.data.transformParentSlotId === slotId) {
      return NextResponse.json({ error: "A slot can't inherit its own transform." }, { status: 400 });
    }
    const parent = await prisma.detailModelSlot.findUnique({ where: { id: parsed.data.transformParentSlotId } });
    if (!parent || parent.projectId !== projectId) {
      return NextResponse.json({ error: "Transform-parent slot not found in this project." }, { status: 400 });
    }
  }

  const updated = await prisma.detailModelSlot.update({
    where: { id: slotId },
    data: {
      name: parsed.data.name,
      role: parsed.data.role,
      transformParentSlotId: parsed.data.transformParentSlotId,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Detail model slot updated",
    entityType: "DetailModelSlot",
    entityId: slotId,
    entityLabel: `${slot.name} -> ${updated.name}`,
  });

  return NextResponse.json(updated);
}

/**
 * Permanently deletes a slot, every version underneath it (Prisma relation
 * `onDelete: Cascade` also removes their `UnitMeshLinkV2` rows), and their
 * stored blobs — same best-effort blob cleanup as the single-version
 * DELETE route. Refuses to delete a project's last remaining slot: a
 * project must always have somewhere to hang a detail model, matching
 * every existing project's real "Building" slot never having been
 * optional before this feature existed.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; slotId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, slotId } = await params;
  const slot = await prisma.detailModelSlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.projectId !== projectId) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }

  const remainingSlots = await prisma.detailModelSlot.count({ where: { projectId } });
  if (remainingSlots <= 1) {
    return NextResponse.json({ error: "Can't delete a project's only detail-model slot." }, { status: 409 });
  }

  const versions = await prisma.detailModelVersion.findMany({
    where: { slotId },
    select: { sourceAssetUrl: true, publicAssetUrl: true },
  });
  const blobUrls = Array.from(new Set(versions.flatMap((v) => [v.sourceAssetUrl, v.publicAssetUrl].filter(Boolean))));
  await Promise.all(
    blobUrls.map((url) =>
      del(url).catch((err) => {
        console.error("3D Experience: blob delete failed (continuing)", url, err);
      })
    )
  );

  await prisma.detailModelSlot.delete({ where: { id: slotId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Detail model slot deleted",
    entityType: "DetailModelSlot",
    entityId: slotId,
    entityLabel: slot.name,
  });

  return NextResponse.json({ ok: true });
}
