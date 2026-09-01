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
    poiYawDeg: z.number().finite().optional(),
    poiEnabled: z.boolean().optional(),
    poiDistanceOverride: z.number().finite().nullable().optional(),
    poiHeightOverride: z.number().finite().nullable().optional(),
  })
);

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

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    action: "Unit links updated",
    entityType: "DetailModelVersion",
    entityId: versionId,
    entityLabel: `v${version.version} (${links.length} linked)`,
  });

  return NextResponse.json(links);
}
