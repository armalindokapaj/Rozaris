import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

const patchSchema = z.object({
  scale: z.number().positive().max(1000).optional(),
  rotationDeg: z.number().optional(),
  altitudeOffset: z.number().optional(),
  positionX: z.number().optional(),
  positionZ: z.number().optional(),
  rotationXDeg: z.number().optional(),
  rotationZDeg: z.number().optional(),
  modelEnabled: z.boolean().optional(),
  modelVisible: z.boolean().optional(),
  castShadow: z.boolean().optional(),
  receiveShadow: z.boolean().optional(),
  selectable: z.boolean().optional(),
  transformLocked: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot edit a published version — upload a new draft instead." },
      { status: 409 }
    );
  }

  const updated = await prisma.detailModelVersion.update({
    where: { id: versionId },
    data: {
      scale: parsed.data.scale,
      rotationDeg: parsed.data.rotationDeg,
      altitudeOffset: parsed.data.altitudeOffset,
      positionX: parsed.data.positionX,
      positionZ: parsed.data.positionZ,
      rotationXDeg: parsed.data.rotationXDeg,
      rotationZDeg: parsed.data.rotationZDeg,
      modelEnabled: parsed.data.modelEnabled,
      modelVisible: parsed.data.modelVisible,
      castShadow: parsed.data.castShadow,
      receiveShadow: parsed.data.receiveShadow,
      selectable: parsed.data.selectable,
      transformLocked: parsed.data.transformLocked,
    },
    include: { unitLinks: true },
  });
  await refreshExperienceDocument(prisma, projectId, versionId);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await prisma.detailModelVersion.update({
    where: { id: versionId },
    data: { deletedAt: new Date(), deletedBy: actor },
  });

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Detail model soft-deleted",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${version.version}`,
    previousState: version,
  });

  return NextResponse.json({ ok: true });
}
