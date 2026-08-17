import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublishTarget } from "@/lib/viewer/resolveTarget";

/**
 * Multi-Channel Publishing PRD Phase 5, §14 "Runtime bootstrap" — the one
 * request a public embed/marketplace viewer shell makes to learn what to
 * load. Deliberately public (no `requireAdmin()` — a `publicKey` IS the
 * access control here, checked by `resolvePublishTarget()`) and
 * deliberately narrow: never returns `/admin/*` paths, `sourceAssetUrl`,
 * admin user ids, audit internals, or draft model/config state (PRD §14's
 * own "the runtime never needs" list) — only what
 * `ViewerRelease.manifest`/`ProjectInventoryState` already computed ahead
 * of time.
 *
 * No page consumes this yet — `/embed/[publicKey]` itself is Phase 4/5's
 * remaining (deliberately deferred, see the PRD memory) rendering-side
 * work. This route exists so that page has a proven, already-working API
 * to call the moment it's built.
 */
export async function GET(request: Request, { params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  const resolution = await resolvePublishTarget(publicKey, request);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: resolution.status });
  }
  const { target } = resolution;

  // project.deletedAt/publisher.deletedAt are already checked inside
  // resolvePublishTarget() (security-audit fix, 2026-08-18) — this fetch is
  // just for the response body's slug/name, not a second gate.
  const project = await prisma.project.findUnique({
    where: { id: target.projectId },
    select: { id: true, slug: true, name: true },
  });
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
    // Shouldn't happen (onDelete: SetNull on the FK) — surfaced distinctly
    // from "never deployed" above so an admin sees a real bug, not a
    // normal not-yet-deployed state.
    return NextResponse.json({ error: "Deployed release could not be found." }, { status: 500 });
  }

  const inventoryState = await prisma.projectInventoryState.findUnique({
    where: { projectId: project.id },
    select: { revision: true },
  });

  return NextResponse.json({
    target: {
      publicKey: target.publicKey,
      type: target.type,
      branding: target.branding ?? null,
      viewerOverrides: target.viewerOverrides ?? null,
    },
    project: { id: project.id, slug: project.slug, name: project.name },
    release: {
      id: release.id,
      version: release.version,
      manifestHash: release.manifestHash,
      manifestUrl: `/api/viewer/v1/t/${target.publicKey}/manifest/${release.id}`,
    },
    inventory: {
      // BigInt doesn't survive JSON.stringify — every consumer of this
      // field treats it as an opaque string to echo back via If-None-Match,
      // never arithmetic, so string is the right wire type, not a lossy
      // Number() cast.
      revision: (inventoryState?.revision ?? BigInt(0)).toString(),
      url: `/api/viewer/v1/t/${target.publicKey}/inventory`,
    },
  });
}
