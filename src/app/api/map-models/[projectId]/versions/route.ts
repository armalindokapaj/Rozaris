import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { fetchAndValidateGlb, type GlbValidationResult } from "@/lib/glbValidate";
import { logAuditEvent } from "@/lib/audit";

const hiddenBuildingSchema = z.object({
  lng: z.number(),
  lat: z.number(),
  footprint: z.any().nullable(),
  featureId: z.union([z.string(), z.number()]).optional(),
});

const createSchema = z.object({
  glbUrl: z.string().url().optional(),
  fileName: z.string().min(1).optional(),
  fileSize: z.number().int().positive().optional(),
  scale: z.number().positive().max(1000).default(1),
  rotationDeg: z.number().default(0),
  altitudeOffset: z.number().default(0),
  longitude: z.number().optional(),
  latitude: z.number().optional(),
  hideBaseBuilding: z.boolean().default(false),
  hiddenBuildings: z.array(hiddenBuildingSchema).default([]),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const versions = await prisma.mapModelVersion.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { version: "desc" },
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
  if (!project || project.deletedAt) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const validation: GlbValidationResult = parsed.data.glbUrl
    ? await fetchAndValidateGlb(parsed.data.glbUrl, "mapModel")
    : { status: "ready", issues: [], triangleCount: null, meshCount: null, materialCount: null, textureCount: null, unitNodeNames: [], sceneManifest: [] };
  const last = await prisma.mapModelVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (last?.version ?? 0) + 1;
  const actor = gate.user?.email ?? gate.user?.name ?? "admin";

  const created = await prisma.mapModelVersion.create({
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
      latitude: project.lat,
      longitude: project.lng,
      heading: parsed.data.rotationDeg,
      altitude: parsed.data.altitudeOffset,
      scale: parsed.data.scale,
      hideBaseBuilding: parsed.data.hideBaseBuilding,
      hiddenBuildings: parsed.data.hiddenBuildings,
      validationStatus: validation.status,
      validationIssues: validation.issues.length ? validation.issues : undefined,
      publicationStatus: "draft",
      uploadedBy: actor,
    },
  });

  await logAuditEvent({
    actor,
    action: "Map model version uploaded",
    entityType: "MapModelVersion",
    entityId: created.id,
    entityLabel: `${project.name} v${created.version}`,
  });

  return NextResponse.json(created);
}
