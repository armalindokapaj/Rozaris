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
  hideBaseBuilding: z.boolean().default(false),
  hiddenBuildingLng: z.number().nullable().optional(),
  hiddenBuildingLat: z.number().nullable().optional(),
});

/**
 * Version history for a project's Mapbox Map Model
 * (PRD_Admin_Mapbox_GLB §18 "Versioning"). GET is public (Admin's
 * MapModelEditor version-history list); POST (create a draft from an
 * already-uploaded Blob URL, running server-side validation) requires the
 * real admin session — src/lib/adminAuth.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const versions = await prisma.mapModelVersion.findMany({
    where: { projectId },
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
  if (!project) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const validation = await fetchAndValidateGlb(parsed.data.glbUrl, "mapModel");
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
      // No independent placement UI for lat/lng yet — default to the
      // project's own coordinates (PRD_Admin_Mapbox_GLB §8's own default),
      // matching what the public renderer already does (MapView.tsx builds
      // MapModelEntry.lng/lat from the project record, not this row).
      latitude: project.lat,
      longitude: project.lng,
      heading: parsed.data.rotationDeg,
      altitude: parsed.data.altitudeOffset,
      scale: parsed.data.scale,
      hideBaseBuilding: parsed.data.hideBaseBuilding,
      hiddenBuildingLng: parsed.data.hiddenBuildingLng ?? null,
      hiddenBuildingLat: parsed.data.hiddenBuildingLat ?? null,
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
