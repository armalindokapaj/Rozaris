import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublishTarget } from "@/lib/viewer/resolveTarget";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicKey: string; releaseId: string }> }
) {
  const { publicKey, releaseId } = await params;
  const resolution = await resolvePublishTarget(publicKey, request);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: resolution.status });
  }
  const { target } = resolution;

  const release = await prisma.viewerRelease.findUnique({ where: { id: releaseId } });
  if (!release || release.projectId !== target.projectId) {
    return NextResponse.json({ error: "Release not found." }, { status: 404 });
  }

  return NextResponse.json(release.manifest, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
