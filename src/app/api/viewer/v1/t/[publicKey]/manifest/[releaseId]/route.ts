import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublishTarget } from "@/lib/viewer/resolveTarget";

/**
 * Multi-Channel Publishing PRD Phase 5, §15 "Immutable manifest caching" —
 * `releaseId` is IN the URL specifically so `Cache-Control: immutable` is
 * actually true: a given release's compiled content never changes (write-
 * once, PRD §4), unlike `bootstrap`'s `manifestUrl`, which points at
 * whichever release is CURRENTLY deployed and does change on redeploy.
 *
 * Still runs the same target resolution as every other public viewer
 * route (status/license/origin) rather than trusting the URL alone —
 * caveat worth being honest about: that makes this response vary by
 * requester even though the header says `public, immutable`, so a CDN or
 * shared cache sitting in front of this route could still serve a cached
 * response to a requester it would otherwise reject. Real edge-level
 * immutable caching for this needs the manifest served from a content-
 * addressed path a CDN can cache without per-request auth (a later,
 * more advanced iteration) — this header mainly saves a browser/client
 * refetch today, not proven CDN behavior.
 */
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
