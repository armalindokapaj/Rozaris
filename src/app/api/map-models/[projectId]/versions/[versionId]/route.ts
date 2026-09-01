import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { fetchAndValidateGlb } from "@/lib/glbValidate";

const hiddenBuildingSchema = z.object({
  lng: z.number(),
  lat: z.number(),
  footprint: z.any().nullable(),
  featureId: z.union([z.string(), z.number()]).optional(),
});

const patchSchema = z.object({
  scale: z.number().positive().max(1000).optional(),
  rotationDeg: z.number().optional(),
  altitudeOffset: z.number().optional(),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  hideBaseBuilding: z.boolean().optional(),
  hiddenBuildings: z.array(hiddenBuildingSchema).optional(),
  glbUrl: z.string().url().optional(),
  fileName: z.string().min(1).optional(),
  fileSize: z.number().int().positive().optional(),
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

  const version = await prisma.mapModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot edit a published version — upload a new draft instead." },
      { status: 409 }
    );
  }

  const attachingModel = parsed.data.glbUrl != null;
  const validation = attachingModel ? await fetchAndValidateGlb(parsed.data.glbUrl!, "mapModel") : null;

  const updated = await prisma.mapModelVersion.update({
    where: { id: versionId },
    data: {
      scale: parsed.data.scale,
      heading: parsed.data.rotationDeg,
      altitude: parsed.data.altitudeOffset,
      hideBaseBuilding: parsed.data.hideBaseBuilding,
      hiddenBuildings: parsed.data.hiddenBuildings,
      ...(attachingModel && {
        sourceAssetUrl: parsed.data.glbUrl,
        publicAssetUrl: parsed.data.glbUrl,
        fileName: parsed.data.fileName,
        fileSize: parsed.data.fileSize,
        triangleCount: validation!.triangleCount,
        meshCount: validation!.meshCount,
        materialCount: validation!.materialCount,
        textureCount: validation!.textureCount,
        validationStatus: validation!.status,
        validationIssues: validation!.issues.length ? validation!.issues : undefined,
      }),
    },
  });

  if (attachingModel) {
    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Map model attached to a placement-only draft",
      entityType: "MapModelVersion",
      entityId: updated.id,
      entityLabel: `${updated.fileName ?? "model"} v${updated.version}`,
      previousState: version,
      newState: updated,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.mapModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await prisma.mapModelVersion.update({
    where: { id: versionId },
    data: { deletedAt: new Date(), deletedBy: actor },
  });
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Map model soft-deleted",
    entityType: "MapModelVersion",
    entityId: versionId,
    entityLabel: `v${version.version}`,
    previousState: version,
  });
  return NextResponse.json({ ok: true });
}
