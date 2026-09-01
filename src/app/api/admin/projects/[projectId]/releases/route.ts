import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { validateViewerRelease } from "@/lib/publishing/validateRelease";
import { compileViewerRelease, type ViewerReleaseManifest } from "@/lib/publishing/compileRelease";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const releases = await prisma.viewerRelease.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      status: true,
      manifestHash: true,
      createdBy: true,
      createdAt: true,
      validatedAt: true,
      archivedAt: true,
    },
  });
  return NextResponse.json(releases);
}

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const readiness = await validateViewerRelease(projectId);
  if (!readiness.ready) {
    return NextResponse.json(
      { error: "Project is not ready for release.", blocking: readiness.blocking, warnings: readiness.warnings },
      { status: 422 }
    );
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";

  try {
    const release = await compileViewerRelease(projectId, actor);
    const manifest = release.manifest as unknown as ViewerReleaseManifest;

    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Viewer release created",
      entityType: "ViewerRelease",
      entityId: release.id,
      entityLabel: `${project.name} v${release.version}`,
      metadata: {
        projectId,
        version: release.version,
        manifestHash: release.manifestHash,
        modelCount: manifest.models.length,
        unitBindingCount: Object.keys(manifest.unitBindings).length,
        warnings: readiness.warnings,
      },
    });

    return NextResponse.json(release);
  } catch (err) {
    await logApiError(`/api/admin/projects/${projectId}/releases`, err, actor);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Release compilation failed." }, { status: 500 });
  }
}
