import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const deploySchema = z.object({ releaseId: z.string().min(1) });

/**
 * Multi-Channel Publishing PRD Phase 7 — "Deploy" (§36-38): points a
 * publish target's `activeReleaseId` at a specific `ViewerRelease`. The
 * one action `POST /api/admin/projects/[projectId]/releases` deliberately
 * doesn't do itself ("no production destination changes yet" — see that
 * route's own doc comment). Passing an OLDER release than the target's
 * current one is a real, supported rollback, not a separate endpoint —
 * "Rollback becomes trivial... just change activeReleaseId" (PRD §38) is
 * exactly this same write, so it gets its own audit action label instead
 * of a parallel route.
 *
 * A `draft` target gets promoted to `active` on its first deploy (there's
 * no point deploying a release to a target that would still fail
 * `resolveTarget`'s status check). A `suspended`/`expired` target's status
 * is left untouched — reactivating one of those is a deliberate, separate
 * admin decision (PATCH `status`), not an implicit side effect of picking
 * a release.
 */
export async function POST(request: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { targetId } = await params;
  const parsed = deploySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const target = await prisma.projectPublishTarget.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "Publish target not found." }, { status: 404 });
  }

  const release = await prisma.viewerRelease.findUnique({ where: { id: parsed.data.releaseId } });
  if (!release || release.projectId !== target.projectId) {
    return NextResponse.json({ error: "Release not found for this project." }, { status: 404 });
  }

  const previousRelease = target.activeReleaseId
    ? await prisma.viewerRelease.findUnique({ where: { id: target.activeReleaseId }, select: { version: true } })
    : null;
  const isRollback = !!previousRelease && release.version < previousRelease.version;

  const updated = await prisma.projectPublishTarget.update({
    where: { id: targetId },
    data: {
      activeReleaseId: release.id,
      status: target.status === "draft" ? "active" : target.status,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: isRollback ? `Release rolled back to v${release.version}` : `Release v${release.version} deployed`,
    entityType: "ProjectPublishTarget",
    entityId: target.id,
    entityLabel: target.name,
    previousState: target,
    newState: updated,
    metadata: { projectId: target.projectId, releaseId: release.id, releaseVersion: release.version, isRollback },
  });

  return NextResponse.json(updated);
}
