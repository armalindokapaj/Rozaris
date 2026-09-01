import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";
import { resolveMeshNameToStore, resolveUnitBlockTarget } from "@/lib/unitBlockMapping";

const patchSchema = z.object({
  unitId: z.string().min(1),
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

  if (current?.meshName === storedMeshName || (!current && storedMeshName === null)) {
    return NextResponse.json({ unchanged: true, target });
  }

  await prisma.$transaction(async (tx) => {
    const touchedUnitIds = [unitId, ...(displaced && displaced.unitId !== unitId ? [displaced.unitId] : [])];
    await tx.unitMeshLinkV2.deleteMany({
      where: { detailModelVersionId: versionId, unitId: { in: touchedUnitIds } },
    });

    const rows: { detailModelVersionId: string; meshName: string; unitId: string; mappingStatus: string }[] = [];
    if (storedMeshName) {
      rows.push({ detailModelVersionId: versionId, meshName: storedMeshName, unitId, mappingStatus: "mapped" });
    }
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
      publicationStatus: target.version.publicationStatus,
      swappedWithUnitId: displaced && displaced.unitId !== unitId ? displaced.unitId : undefined,
    },
  });

  return NextResponse.json({ unchanged: false, target: await resolveUnitBlockTarget(projectId) });
}
