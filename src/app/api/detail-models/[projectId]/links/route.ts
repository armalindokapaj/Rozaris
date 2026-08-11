import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const linksSchema = z.array(
  z.object({
    meshName: z.string().min(1),
    unitId: z.string().min(1),
  })
);

/**
 * Admin's confirmed Unit_<number> -> Unit mapping for one project's detailed
 * GLB (Project3DConfigEditor's "Link Units" list). PUT replaces the full
 * set — the admin UI always submits every detected node's current
 * selection (unselected rows are simply omitted), so a full delete+recreate
 * is simpler and safer than diffing individual rows, and this list is small
 * (one row per unit in a project, not per visitor action).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const parsed = linksSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const detailModel = await prisma.projectDetailModel.findUnique({ where: { projectId } });
  if (!detailModel) {
    return NextResponse.json(
      { error: `No detail model for "${projectId}" — save the GLB placement first.` },
      { status: 404 }
    );
  }

  const links = await prisma.$transaction(async (tx) => {
    await tx.unitMeshLink.deleteMany({ where: { projectId } });
    if (parsed.data.length === 0) return [];
    await tx.unitMeshLink.createMany({
      data: parsed.data.map((link) => ({ projectId, ...link })),
    });
    return tx.unitMeshLink.findMany({ where: { projectId } });
  });

  return NextResponse.json(links);
}
