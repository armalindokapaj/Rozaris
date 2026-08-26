import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";
import { resolveMeshNameToStore, resolveUnitBlockTarget } from "@/lib/unitBlockMapping";

/**
 * Project Manager → Sheet Sync → the 3D BLOCK column: read and rebind which
 * GLB block each real unit is, one unit at a time.
 *
 * Sibling of `api/detail-models/[projectId]/versions/[versionId]/links`,
 * not a replacement for it, and different in the three ways that matter:
 *
 *  1. **One unit per call, not a full replace.** That route's PUT is
 *     "the editor always submits every detected node's current selection",
 *     which is only safe when a single component owns the whole set. An
 *     inventory grid does not — it edits one row while a 30s poll refreshes
 *     the rest — so a full replace here would let a stale client silently
 *     delete every mapping it had not loaded yet.
 *
 *  2. **It works on a published version.** See `unitBlockMapping.ts` for
 *     the full reasoning: the editor is gated on a draft being active and
 *     that route 409s on a published version, which together left a
 *     published-only Units slot with no correction path at all. A wrong
 *     binding sends buyers to the wrong listing; making them wait for a GLB
 *     re-upload to fix a typo'd mapping is not a defensible trade. The
 *     version's GLB, transform and overrides are still immutable — only the
 *     block→unit binding moves, and every move is audit-logged with a
 *     before/after snapshot.
 *
 *  3. **Assignment swaps rather than steals.** `@@unique([versionId,
 *     meshName])` and `@@unique([versionId, unitId])` make the mapping 1:1,
 *     so pointing unit A at a block unit B holds has to do something with
 *     B. It hands B the block A was holding — which repairs a crossed pair
 *     (the exact defect this surface was built for) in one action instead
 *     of two, and never leaves the project transiently failing the publish
 *     gate's "every block mapped" rule the way a steal would.
 */

const patchSchema = z.object({
  unitId: z.string().min(1),
  /** `null` unbinds the unit, leaving its block free. */
  meshName: z.string().min(1).nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const target = await resolveUnitBlockTarget(projectId);
  // 200 with a null target, not a 404: "this project has no 3D unit blocks"
  // is an ordinary state the grid renders as a disabled column, and an
  // error status would make the section show a failure banner for it.
  return NextResponse.json(target);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { unitId, meshName } = parsed.data;

  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit || unit.projectId !== projectId || unit.deletedAt) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const target = await resolveUnitBlockTarget(projectId);
  if (!target) {
    return NextResponse.json(
      { error: "This project has no 3D model with unit blocks yet." },
      { status: 409 }
    );
  }

  // A name this version has no node for can never resolve at runtime, so it
  // is rejected rather than stored — the one thing a free-text mesh field
  // would have made easy to get silently wrong.
  const storedMeshName = meshName === null ? null : resolveMeshNameToStore(target, meshName);
  if (meshName !== null && storedMeshName === null) {
    return NextResponse.json(
      { error: `"${meshName}" is not a block in ${target.version.fileName}.` },
      { status: 400 }
    );
  }

  const versionId = target.version.id;
  const before = await prisma.unitMeshLinkV2.findMany({
    where: { detailModelVersionId: versionId },
    orderBy: { meshName: "asc" },
    select: { meshName: true, unitId: true },
  });

  const current = before.find((l) => l.unitId === unitId) ?? null;
  const displaced = storedMeshName ? before.find((l) => l.meshName === storedMeshName) ?? null : null;

  // Already exactly this — don't write an audit row and a document refresh
  // for a no-op (the grid can re-send on a retry or a blur). `target` is
  // reused rather than re-resolved: nothing has been written on this path,
  // so it is still accurate, and each resolve is several round trips.
  if (current?.meshName === storedMeshName || (!current && storedMeshName === null)) {
    return NextResponse.json({ unchanged: true, target });
  }

  await prisma.$transaction(async (tx) => {
    // Both uniques are (versionId, X), so the rows involved are deleted
    // first and recreated rather than updated in place — an update-then-
    // update sequence would transiently violate one of them and fail.
    const touchedUnitIds = [unitId, ...(displaced && displaced.unitId !== unitId ? [displaced.unitId] : [])];
    await tx.unitMeshLinkV2.deleteMany({
      where: { detailModelVersionId: versionId, unitId: { in: touchedUnitIds } },
    });

    const rows: { detailModelVersionId: string; meshName: string; unitId: string; mappingStatus: string }[] = [];
    if (storedMeshName) {
      rows.push({ detailModelVersionId: versionId, meshName: storedMeshName, unitId, mappingStatus: "mapped" });
    }
    // The swap half: whoever held the requested block inherits the block
    // this unit was holding. When this unit held nothing, the displaced
    // unit is simply left unmapped — there is no block to give it.
    if (displaced && displaced.unitId !== unitId && current) {
      rows.push({
        detailModelVersionId: versionId,
        meshName: current.meshName,
        unitId: displaced.unitId,
        mappingStatus: "mapped",
      });
    }
    if (rows.length > 0) await tx.unitMeshLinkV2.createMany({ data: rows });
  });

  await refreshExperienceDocument(prisma, projectId, versionId);

  const after = await prisma.unitMeshLinkV2.findMany({
    where: { detailModelVersionId: versionId },
    orderBy: { meshName: "asc" },
    select: { meshName: true, unitId: true },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action: storedMeshName ? "Unit 3D block rebound" : "Unit 3D block unbound",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `${unit.code} → ${storedMeshName ?? "none"} (v${target.version.version})`,
    previousState: { links: before },
    newState: { links: after },
    metadata: {
      source: "sheetSync",
      unitId,
      unitCode: unit.code,
      // Named explicitly so the audit trail says a published version was
      // edited in place, rather than leaving that to be inferred.
      publicationStatus: target.version.publicationStatus,
      swappedWithUnitId: displaced && displaced.unitId !== unitId ? displaced.unitId : undefined,
    },
  });

  return NextResponse.json({ unchanged: false, target: await resolveUnitBlockTarget(projectId) });
}
