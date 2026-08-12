import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAndValidateGlb } from "@/lib/glbValidate";
import { logAuditEvent } from "@/lib/audit";

const createSchema = z.object({
  glbUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  scale: z.number().positive().max(1000).default(1),
  rotationDeg: z.number().default(0),
  altitudeOffset: z.number().default(0),
});

/**
 * Version history for a project's detailed 3D Experience GLB
 * (PRD_Admin_3D_Project_Experience §34 "Versioning"). GET is public
 * (Project3DConfigEditor's version-history list); POST creates a draft from
 * an already-uploaded Blob URL, runs server-side validation, and carries
 * forward unit mesh mappings from the current published version for any
 * mesh name the new GLB still has — §19 "Mapping Version Behavior".
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const versions = await prisma.detailModelVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    include: { unitLinks: true },
  });
  return NextResponse.json(versions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const validation = await fetchAndValidateGlb(parsed.data.glbUrl, "detailModel");
  const last = await prisma.detailModelVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const actor = gate.user?.email ?? gate.user?.name ?? "admin";

  const publishedVersion = await prisma.detailModelVersion.findFirst({
    where: { projectId, publicationStatus: "published" },
    include: { unitLinks: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.detailModelVersion.create({
      data: {
        projectId,
        version: nextVersion,
        sourceAssetUrl: parsed.data.glbUrl,
        publicAssetUrl: parsed.data.glbUrl,
        fileName: parsed.data.fileName,
        fileSize: parsed.data.fileSize,
        triangleCount: validation.triangleCount,
        meshCount: validation.meshCount,
        materialCount: validation.materialCount,
        textureCount: validation.textureCount,
        scale: parsed.data.scale,
        rotationDeg: parsed.data.rotationDeg,
        altitudeOffset: parsed.data.altitudeOffset,
        validationStatus: validation.status,
        validationIssues: validation.issues.length ? validation.issues : undefined,
        publicationStatus: "draft",
        uploadedBy: actor,
      },
    });

    // Carry forward mappings whose mesh name still exists in the new GLB —
    // PRD §19: "When a replacement GLB uses identical stable mesh names,
    // ROZARIS attempts to carry mappings forward." Anything else (renamed/
    // new/removed nodes) simply isn't created here; the admin editor's node
    // list will show it unlinked, same as a first upload.
    const carryable = (publishedVersion?.unitLinks ?? []).filter((l) =>
      validation.unitNodeNames.includes(l.meshName)
    );
    if (carryable.length > 0) {
      await tx.unitMeshLinkV2.createMany({
        data: carryable.map((l) => ({
          detailModelVersionId: version.id,
          meshName: l.meshName,
          unitId: l.unitId,
          mappingStatus: "carried",
        })),
      });
    }

    return tx.detailModelVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: { unitLinks: true },
    });
  });

  await logAuditEvent({
    actor,
    action: "Detail model version uploaded",
    entityType: "DetailModelVersion",
    entityId: created.id,
    entityLabel: `${project.name} v${created.version}`,
  });

  return NextResponse.json(created);
}
