import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

const linksSchema = z.array(
  z.object({
    meshName: z.string().min(1),
    unitId: z.string().min(1),
    // Units Blocks & POI Layer PRD §7/§15 — optional so existing callers
    // that only ever sent {meshName, unitId} (e.g. a not-yet-updated
    // client) keep working; the DB default (0°, enabled, no overrides)
    // applies when omitted.
    poiYawDeg: z.number().finite().optional(),
    poiEnabled: z.boolean().optional(),
    poiDistanceOverride: z.number().finite().nullable().optional(),
    poiHeightOverride: z.number().finite().nullable().optional(),
  })
);

/**
 * Admin's confirmed Unit_<number> -> Unit mapping for one specific draft
 * version (version-scoped sibling of the legacy, project-scoped
 * src/app/api/detail-models/[projectId]/links/route.ts). PUT replaces the
 * full set for this version — same "admin UI always submits every detected
 * node's current selection" reasoning as the legacy route. Every row
 * submitted here is treated as admin-confirmed ("mapped"), overwriting any
 * "carried"/"needs_review" status a carry-forward row might have had.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const parsed = linksSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId || version.deletedAt) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot edit mappings on a published version — upload a new draft instead." },
      { status: 409 }
    );
  }

  // Units Blocks & POI Layer PRD §8 — this route verified the VERSION
  // belongs to the project but never verified each submitted unitId does.
  // Before this fix, an admin (or a buggy client) could bind a mesh to a
  // Unit row from a completely different project — invisible in the UI
  // (the picker only ever offers this project's own units) but a real
  // cross-tenant data-integrity hole via a direct API call. Also rejects
  // the same unitId appearing twice in one payload with a clean 400
  // instead of letting the DB's new (detailModelVersionId, unitId) unique
  // constraint surface as an opaque 500.
  const submittedUnitIds = [...new Set(parsed.data.map((l) => l.unitId))];
  if (submittedUnitIds.length !== parsed.data.length) {
    return NextResponse.json({ error: "Each unit can only be mapped to one mesh." }, { status: 400 });
  }
  if (submittedUnitIds.length > 0) {
    const validUnits = await prisma.unit.findMany({
      where: { id: { in: submittedUnitIds }, projectId, deletedAt: null },
      select: { id: true },
    });
    if (validUnits.length !== submittedUnitIds.length) {
      const validIds = new Set(validUnits.map((u) => u.id));
      const invalid = submittedUnitIds.filter((id) => !validIds.has(id));
      return NextResponse.json(
        { error: `Unit(s) not found in this project: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const links = await prisma.$transaction(async (tx) => {
    await tx.unitMeshLinkV2.deleteMany({ where: { detailModelVersionId: versionId } });
    if (parsed.data.length === 0) return [];
    await tx.unitMeshLinkV2.createMany({
      data: parsed.data.map((link) => ({
        detailModelVersionId: versionId,
        meshName: link.meshName,
        unitId: link.unitId,
        mappingStatus: "mapped",
        poiYawDeg: link.poiYawDeg ?? 0,
        poiEnabled: link.poiEnabled ?? true,
        poiDistanceOverride: link.poiDistanceOverride ?? null,
        poiHeightOverride: link.poiHeightOverride ?? null,
      })),
    });
    return tx.unitMeshLinkV2.findMany({ where: { detailModelVersionId: versionId } });
  });
  await refreshExperienceDocument(prisma, projectId, versionId);

  // Every other write route in this directory (upload/publish/rollback/
  // discard) logs — this one was the one gap, presumably an oversight
  // rather than a deliberate omission, since a full replace of a version's
  // unit bindings is exactly the kind of admin action the audit trail
  // exists to capture.
  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    action: "Unit links updated",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${version.version} (${links.length} linked)`,
  });

  return NextResponse.json(links);
}
