import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

const patchSchema = z.object({
  scale: z.number().positive().max(1000).optional(),
  rotationDeg: z.number().optional(),
  altitudeOffset: z.number().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot edit a published version — upload a new draft instead." },
      { status: 409 }
    );
  }

  const updated = await prisma.detailModelVersion.update({
    where: { id: versionId },
    data: {
      scale: parsed.data.scale,
      rotationDeg: parsed.data.rotationDeg,
      altitudeOffset: parsed.data.altitudeOffset,
    },
    include: { unitLinks: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, versionId } = await params;
  const version = await prisma.detailModelVersion.findUnique({ where: { id: versionId } });
  if (!version || version.projectId !== projectId) {
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  }
  if (version.publicationStatus === "published") {
    return NextResponse.json(
      { error: "Cannot discard the published version — publish a different one first." },
      { status: 409 }
    );
  }
  await prisma.detailModelVersion.delete({ where: { id: versionId } });
  return NextResponse.json({ ok: true });
}
