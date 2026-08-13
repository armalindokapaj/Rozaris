import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/** Deletes a shared Platform HDRI — its Postgres row and its blob. Any
 * project currently referencing it via `Project3DConfig.hdriId` falls back
 * to its procedural `skyPreset` gradient automatically (the FK is
 * `onDelete: SetNull` in prisma/schema.prisma), not left dangling. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const hdri = await prisma.platformHdri.findUnique({ where: { id } });
  if (!hdri) {
    return NextResponse.json({ error: "HDRI not found." }, { status: 404 });
  }

  await del(hdri.url).catch((err) => {
    console.error("Platform HDRI: blob delete failed (continuing)", hdri.url, err);
  });
  await prisma.platformHdri.delete({ where: { id } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Platform HDRI deleted",
    entityType: "PlatformHdri",
    entityId: id,
    entityLabel: hdri.name,
  });

  return NextResponse.json({ ok: true });
}
