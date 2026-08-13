import { del } from "@vercel/blob";
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
  if (!version || version.projectId !== projectId) {
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
    },
    include: { unitLinks: true },
  });
  await refreshExperienceDocument(prisma, projectId, versionId);
  return NextResponse.json(updated);
}

/**
 * Permanently deletes a version — its Postgres row AND its stored blob(s).
 * Previously only allowed for non-published rows and never touched
 * storage (a draft's underlying GLB stayed on Vercel Blob forever, and
 * there was no way to remove a published/archived model at all — "remove"
 * elsewhere in the editor only ever archives). This is the real delete
 * path both the editor's single "Delete Model" button (any status,
 * including the currently published version) and its per-version history
 * delete (old archived versions) call. No "cannot delete published" guard
 * anymore — that used to protect against orphaning the live experience,
 * but "delete the model" is a real, intentional destructive action now;
 * the public viewer already degrades to procedural massing when no
 * published version exists (see ProceduralProjectViewer's glbLoadFailed/
 * usingGlb fallback).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }

  // Best-effort blob cleanup — sourceAssetUrl/publicAssetUrl are the same
  // URL today (no delivery-asset split yet), so dedupe before deleting;
  // a blob that's already gone (or shared/already-deleted) must not block
  // the Postgres row from being removed.
  const blobUrls = Array.from(new Set([version.sourceAssetUrl, version.publicAssetUrl].filter(Boolean)));
  await Promise.all(
    blobUrls.map((url) =>
      del(url).catch((err) => {
        console.error("3D Experience: blob delete failed (continuing)", url, err);
      })
    )
  );

  await prisma.detailModelVersion.delete({ where: { id: versionId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "Detail model deleted",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${version.version}`,
  });

  return NextResponse.json({ ok: true });
}
