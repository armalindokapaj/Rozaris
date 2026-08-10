import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const mapModelSchema = z.object({
  glbUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  scale: z.number().positive().max(1000),
  rotationDeg: z.number(),
  altitudeOffset: z.number(),
  enabled: z.boolean(),
  hideBaseBuilding: z.boolean(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const model = await prisma.projectMapModel.findUnique({ where: { projectId } });
  return NextResponse.json(model);
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
