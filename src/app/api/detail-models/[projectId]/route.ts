import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const detailModelSchema = z.object({
  glbUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  scale: z.number().positive().max(1000),
  rotationDeg: z.number(),
  altitudeOffset: z.number(),
  enabled: z.boolean(),
});

/**
 * ⚠️ LEGACY as of the versioning pass — GET below now resolves the
 * project's currently-*published* `DetailModelVersion` (see
 * ./versions/route.ts for the full history/draft/publish/rollback/
 * carry-forward pipeline) instead of the old single-row
 * `ProjectDetailModel`, keeping the exact same response shape
 * (`glbUrl/fileName/.../enabled/unitLinks: {meshName,unitId}[]`) so
 * useProjectDetailModel.ts and every other existing caller needs zero
 * changes. PUT/DELETE further down and ./links/route.ts still write the
 * legacy `ProjectDetailModel`/`UnitMeshLink` tables — left in place,
 * unused by the admin UI once it switches to POST/PATCH .../versions, as a
 * one-release safety net. Do not build new features against them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const version = await prisma.detailModelVersion.findFirst({
    where: { projectId, publicationStatus: "published" },
    include: { unitLinks: true },
  });
  if (!version) return NextResponse.json(null);
  return NextResponse.json({
    glbUrl: version.publicAssetUrl,
    fileName: version.fileName,
    fileSize: version.fileSize,
    scale: version.scale,
    rotationDeg: version.rotationDeg,
    altitudeOffset: version.altitudeOffset,
    enabled: version.publicationStatus === "published",
    updatedAt: version.updatedAt,
    unitLinks: version.unitLinks.map((l) => ({ meshName: l.meshName, unitId: l.unitId })),
  });
}

/**
 * Upserts one project's detailed-GLB placement (Project3DConfigEditor's
 * upload/replace/scale/rotation/altitude/enabled controls). ⚠️ Same known
 * gap as src/app/api/blob/upload/route.ts: no session/role check yet — add
 * an admin check here the moment real auth is wired into the UI.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const parsed = detailModelSchema.safeParse(await request.json());
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

  const model = await prisma.projectDetailModel.upsert({
    where: { projectId },
    update: parsed.data,
    create: { projectId, ...parsed.data },
    include: { unitLinks: true },
  });
  return NextResponse.json(model);
}

/** Deletes the placement row and cascades its unit links (Prisma relation
 * onDelete: Cascade) — does NOT delete the Blob object, callers should hit
 * /api/blob/delete first (same two-step pattern as MapModelEditor's Remove). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  await prisma.projectDetailModel.deleteMany({ where: { projectId } });
  return NextResponse.json({ ok: true });
}
