import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";
import { validateViewerRelease } from "@/lib/publishing/validateRelease";
import { compileViewerRelease, type ViewerReleaseManifest } from "@/lib/publishing/compileRelease";

/**
 * List releases for a project — summary only (no `manifest` body, which can
 * be sizeable) for the future Distribution UI's version picker. Full detail
 * lives at `/releases/[releaseId]`.
 */
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

/**
 * "Create Release" (PRD §35-36) — validates, compiles, and creates ONE
 * immutable `ViewerRelease` row. Does NOT deploy it anywhere: no
 * `ProjectPublishTarget.activeReleaseId` changes here (that's a separate
 * "deploy" action, Phase 7's admin Distribution UI + `activateRelease.ts`
 * once it exists) — matches the PRD's own "no production destination
 * changes yet" note on this exact step.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Server-side re-check, deliberately — never trust an earlier client call
  // to /readiness (PRD's own principle: this route is the one that actually
  // matters).
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
