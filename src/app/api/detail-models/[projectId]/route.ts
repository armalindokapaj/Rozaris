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
 * The Project 3D Experience's detailed GLB — a separate row/upload from
 * ProjectMapModel (src/app/api/map-models), see ProjectDetailModel's doc
 * comment in src/lib/types.ts. Returns the placement row plus its
 * admin-confirmed Unit_<number> -> Unit links (see ./links/route.ts for
 * editing those) so the public viewer can fetch everything it needs in one
 * request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const model = await prisma.projectDetailModel.findUnique({
    where: { projectId },
    include: { unitLinks: true },
  });
  return NextResponse.json(model);
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
