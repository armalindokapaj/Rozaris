import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAndValidateGlb } from "@/lib/glbValidate";
import { logAuditEvent } from "@/lib/audit";
import type { NodeOverride, SceneManifestNode } from "@/lib/types";

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

  // Carry forward scene overrides (classification/material) whose node
  // NAME still exists in the new GLB's manifest — same "identical stable
  // name -> carry it forward" rule §19 already applies to unit links, just
  // hand-rolled here since overrides are a JSON blob, not a table with its
  // own mappingStatus column. rzNodeId is remapped to the *new* manifest's
  // id for that name, since the index component of the id can differ
  // between versions even when the name is unchanged.
  const nameToNewRzNodeId = new Map(validation.sceneManifest.map((n) => [n.name, n.rzNodeId]));
  const previousOverrides = (publishedVersion?.nodeOverrides as NodeOverride[] | null) ?? [];
  const previousManifest = (publishedVersion?.sceneManifest as SceneManifestNode[] | null) ?? [];
  const rzNodeIdToName = new Map(previousManifest.map((n) => [n.rzNodeId, n.name]));
  const carriedOverrides: NodeOverride[] = previousOverrides.flatMap((o) => {
    const name = rzNodeIdToName.get(o.rzNodeId);
    const newRzNodeId = name ? nameToNewRzNodeId.get(name) : undefined;
    if (!newRzNodeId) return [];
    return [{ ...o, rzNodeId: newRzNodeId, carried: true }];
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
        // Cast needed for Prisma's Json input type — plain TS interfaces
        // (unlike z.any()-typed fields elsewhere in this codebase, e.g.
        // hiddenBuildings) don't structurally satisfy InputJsonObject's
        // index signature without it; the values themselves are already
        // plain serializable objects.
        sceneManifest: validation.sceneManifest as unknown as Prisma.InputJsonValue,
        nodeOverrides: carriedOverrides.length
          ? (carriedOverrides as unknown as Prisma.InputJsonValue)
          : undefined,
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
