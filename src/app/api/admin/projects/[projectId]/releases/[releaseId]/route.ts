import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; releaseId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId, releaseId } = await params;
  const release = await prisma.viewerRelease.findUnique({ where: { id: releaseId } });
  if (!release || release.projectId !== projectId) {
    return NextResponse.json({ error: "Release not found." }, { status: 404 });
  }
  return NextResponse.json(release);
}
