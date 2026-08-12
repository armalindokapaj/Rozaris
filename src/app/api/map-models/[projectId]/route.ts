import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * ⚠️ LEGACY as of the versioning pass — GET below now resolves the
 * project's currently-*published* `MapModelVersion` instead of the old
 * single-row `ProjectMapModel`, keeping the exact same response shape for
 * MapModelEditor.tsx and every other existing caller. PUT/DELETE further
 * down still write the legacy `ProjectMapModel` table (unauthenticated,
 * same known gap as before) — left in place, unused by the admin UI once
 * it switches to POST/PATCH .../versions, as a one-release safety net. Do
 * not build new features against PUT/DELETE here.
 */
function toLegacyShape(v: {
  projectId: string;
  publicAssetUrl: string;
  fileName: string;
  fileSize: number;
  scale: number;
  heading: number;
  altitude: number;
  longitude: number;
  latitude: number;
  publicationStatus: string;
  hideBaseBuilding: boolean;
  hiddenBuildings: unknown;
  updatedAt: Date;
}) {
  return {
    projectId: v.projectId,
    glbUrl: v.publicAssetUrl,
    fileName: v.fileName,
    fileSize: v.fileSize,
    scale: v.scale,
    rotationDeg: v.heading,
    altitudeOffset: v.altitude,
    // Multi-building-pick + reposition pass — was hardcoded to the
    // project's own coordinates by every consumer before this (these
    // columns were write-only); now the actual, possibly-dragged position.
    lng: v.longitude,
    lat: v.latitude,
    enabled: v.publicationStatus === "published",
    hideBaseBuilding: v.hideBaseBuilding,
    hiddenBuildings: v.hiddenBuildings ?? [],
    updatedAt: v.updatedAt,
  };
}

const mapModelSchema = z.object({
  glbUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  scale: z.number().positive().max(1000),
  rotationDeg: z.number(),
  altitudeOffset: z.number(),
  enabled: z.boolean(),
  hideBaseBuilding: z.boolean(),
  hiddenBuildingLng: z.number().nullable().optional(),
  hiddenBuildingLat: z.number().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const version = await prisma.mapModelVersion.findFirst({
    where: { projectId, publicationStatus: "published" },
  });
  return NextResponse.json(version ? toLegacyShape(version) : null);
}

/**
 * Upserts one project's GLB placement — MapModelEditor.tsx's "Save
 * placement" button. ⚠️ Same known gap as src/app/api/blob/upload/route.ts:
 * no session/role check yet (real auth isn't wired into the UI — see the
 * "rozaris-backend-plan" memory). Add an admin check here the moment it is.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const parsed = mapModelSchema.safeParse(await request.json());
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

  const model = await prisma.projectMapModel.upsert({
    where: { projectId },
    update: parsed.data,
    create: { projectId, ...parsed.data },
  });
  return NextResponse.json(model);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  await prisma.projectMapModel.deleteMany({ where: { projectId } });
  return NextResponse.json({ ok: true });
}
