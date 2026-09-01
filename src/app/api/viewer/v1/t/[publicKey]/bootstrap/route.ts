import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublishTarget } from "@/lib/viewer/resolveTarget";
import { getProjectById } from "@/lib/projects.server";

export async function GET(request: Request, { params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  const resolution = await resolvePublishTarget(publicKey, request);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: resolution.status });
  }
  const { target } = resolution;

  const project = await getProjectById(target.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!target.activeReleaseId) {
    return NextResponse.json(
      { error: "No release has been deployed to this publish target yet." },
      { status: 409 }
    );
  }
  const release = await prisma.viewerRelease.findUnique({
    where: { id: target.activeReleaseId },
    select: { id: true, version: true, manifestHash: true },
  });
  if (!release) {
    return NextResponse.json({ error: "Deployed release could not be found." }, { status: 500 });
  }

  const inventoryState = await prisma.projectInventoryState.findUnique({
    where: { projectId: project.id },
    select: { revision: true },
  });

  const { units: _rawUnitsExcludedFromWire, ...publicProject } = project;
  void _rawUnitsExcludedFromWire;

  return NextResponse.json({
    target: {
      publicKey: target.publicKey,
      type: target.type,
      branding: target.branding ?? null,
      viewerOverrides: target.viewerOverrides ?? null,
    },
    project: publicProject,
    release: {
      id: release.id,
      version: release.version,
      manifestHash: release.manifestHash,
      manifestUrl: `/api/viewer/v1/t/${target.publicKey}/manifest/${release.id}`,
    },
    inventory: {
      revision: (inventoryState?.revision ?? BigInt(0)).toString(),
      url: `/api/viewer/v1/t/${target.publicKey}/inventory`,
    },
  });
}
