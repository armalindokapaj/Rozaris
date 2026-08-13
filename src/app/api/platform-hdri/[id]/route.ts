import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/**
 * Soft-deletes a shared Platform HDRI — Super Admin control/audit pass, no
 * longer a real `prisma.delete()` + blob removal. Deliberately does NOT
 * null out `Project3DConfig.hdriId` on projects currently using it (unlike
 * the old hard-delete, which relied on the FK's `onDelete: SetNull`) — the
 * row still physically exists, just hidden from the picker/library below,
 * so those projects keep rendering with it until either a restore or an
 * actual Super Admin hard-delete (which is when `onDelete: SetNull` fires
 * for real and they fall back to their procedural `skyPreset`).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const hdri = await prisma.platformHdri.findUnique({ where: { id } });
  if (!hdri || hdri.deletedAt) {
    return NextResponse.json({ error: "HDRI not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await prisma.platformHdri.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: actor },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Platform HDRI soft-deleted",
    entityType: "PlatformHdri",
    entityId: id,
    entityLabel: hdri.name,
    previousState: hdri,
  });

  return NextResponse.json({ ok: true });
}
