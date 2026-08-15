import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

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

  const updated = await prisma.mapModelVersion.update({
    where: { id: versionId },
    data: {
      scale: parsed.data.scale,
      heading: parsed.data.rotationDeg,
      altitude: parsed.data.altitudeOffset,
      longitude: parsed.data.longitude,
      latitude: parsed.data.latitude,
      hideBaseBuilding: parsed.data.hideBaseBuilding,
      hiddenBuildings: parsed.data.hiddenBuildings,
    },
  });
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
