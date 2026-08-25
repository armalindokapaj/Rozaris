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
  // ONE LOCATION — accepted but ignored, same as the POST route's
  // `createSchema`. A version's anchor is the project's coordinates; the
  // 3D Map Control's pin writes them through
  // `PATCH /api/admin/projects/[projectId]/location`, which then re-anchors
  // every version (src/lib/projectLocation.ts).
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  hideBaseBuilding: z.boolean().optional(),
  hiddenBuildings: z.array(hiddenBuildingSchema).optional(),
  // "Add the 3D model later" — a placement-only draft (created via POST
  // with no glbUrl, see that route's own doc comment) attaches its model
  // through this same PATCH later, rather than creating a whole separate
  // version for what's really still "version 1, now with its file." Only
  // meaningful together; validated as a real upload the same way the POST
  // route validates a brand-new one.
  glbUrl: z.string().url().optional(),
  fileName: z.string().min(1).optional(),
  fileSize: z.number().int().positive().optional(),
});

/** Update a draft's placement/visibility fields, or discard a draft
 * outright. A published version is immutable — PRD_Admin_Mapbox_GLB §18
 * "Each upload/replacement creates a new immutable model version record." */
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

  // Attaching a model to a version that was saved without one — validate
  // exactly like a brand-new upload would (POST route), since this is the
  // first time this row's asset is actually known. A version that already
  // has a file never sends glbUrl here (MapModelEditor.tsx's own "Replace"
  // flow posts a whole new version instead, per this route's own doc
  // comment above — a published/immutable-once-live version's history).
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

/**
 * Soft-deletes a version — Postgres row marked `deletedAt`/`deletedBy`,
 * stored blob left alone (Super Admin control/audit pass; restorable from
 * the Recycle Bin, permanently gone only via a Super Admin hard-delete).
 * Both MapModelEditor.tsx's "Delete Model" button (any status, including
 * the currently published version) and its per-version history delete
 * call this — no "cannot delete published" guard, matching the identical
 * detail-model route (see that route's own doc comment for why: "Remove"
 * already covers the softer "take it off the map but keep it in history"
 * case via /unpublish, so this one is deliberately unconditional).
 */
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
