import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

const linksSchema = z.array(
  z.object({
    meshName: z.string().min(1),
    unitId: z.string().min(1),
  })
);

/**
 * Admin's confirmed Unit_<number> -> Unit mapping for one specific draft
 * version (version-scoped sibling of the legacy, project-scoped
 * src/app/api/detail-models/[projectId]/links/route.ts). PUT replaces the
 * full set for this version — same "admin UI always submits every detected
 * node's current selection" reasoning as the legacy route. Every row
 * submitted here is treated as admin-confirmed ("mapped"), overwriting any
 * "carried"/"needs_review" status a carry-forward row might have had.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const parsed = linksSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot edit mappings on a published version — upload a new draft instead." },
      { status: 409 }
    );
  }

  const links = await prisma.$transaction(async (tx) => {
    await tx.unitMeshLinkV2.deleteMany({ where: { detailModelVersionId: versionId } });
    if (parsed.data.length === 0) return [];
    await tx.unitMeshLinkV2.createMany({
      data: parsed.data.map((link) => ({
        detailModelVersionId: versionId,
        meshName: link.meshName,
        unitId: link.unitId,
        mappingStatus: "mapped",
      })),
    });
    return tx.unitMeshLinkV2.findMany({ where: { detailModelVersionId: versionId } });
  });

  return NextResponse.json(links);
}
