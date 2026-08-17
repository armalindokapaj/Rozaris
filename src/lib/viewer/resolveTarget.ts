import { prisma } from "@/lib/db";
import type { ProjectPublishTarget } from "@/generated/prisma";

export interface TargetResolutionFailure {
  ok: false;
  status: number;
  error: string;
}

export interface TargetResolutionSuccess {
  ok: true;
  target: ProjectPublishTarget;
}

export type TargetResolutionResult = TargetResolutionSuccess | TargetResolutionFailure;

/**
 * Multi-Channel Publishing PRD Phase 5 — the one place every public
 * `/api/viewer/v1/t/[publicKey]/*` route resolves an opaque `publicKey`
 * into a live, licensed, origin-permitted `ProjectPublishTarget`. PRD §41:
 * "Check: target ACTIVE? license valid? origin permitted? release
 * assigned?" (release-assignment is checked by bootstrap's own caller, not
 * here, since the manifest/inventory routes don't all need it).
 *
 * Deliberately a generic 404 for "doesn't exist at all" — never reveal
 * whether a key format is merely wrong vs. a real-but-revoked one — but a
 * specific reason once a target IS found, matching PRD §60's "SUSPEND
 * VIEWER" flow (the whole point of a distinct suspended state is that it's
 * meant to be a visible, branded "unavailable" message, not a bare 404).
 *
 * Origin enforcement here is defense-in-depth only, checked when the
 * request actually carries an `Origin` header. The PRD's stronger
 * mechanism (`Content-Security-Policy: frame-ancestors`, §43) belongs on
 * the `/embed/[publicKey]` PAGE response itself, which doesn't exist yet —
 * see the "rozaris-multichannel-publishing-prd" memory for why that's
 * deliberately deferred to a session with real browser verification
 * available, unlike this API-layer work.
 *
 * Security-audit fix (2026-08-18): also checks the target's own
 * `project.deletedAt`/`publisher.deletedAt` — the admin Recycle Bin's
 * soft-delete (`src/lib/adminEntities.ts`) sets those flags but doesn't
 * cascade to suspend related `ProjectPublishTarget` rows, and this check
 * used to live only in `bootstrap/route.ts` (project only, never
 * publisher), so a caller already holding a `publicKey`/`releaseId` could
 * keep hitting `manifest`/`inventory` directly — bypassing `bootstrap`
 * entirely — after an admin believed Recycle-Binning the project or its
 * whole publisher had taken it offline. Centralized here so every current
 * and future route sharing this resolver inherits it, instead of each
 * route needing to remember to re-implement it.
 */
export async function resolvePublishTarget(publicKey: string, request: Request): Promise<TargetResolutionResult> {
  const target = await prisma.projectPublishTarget.findUnique({
    where: { publicKey },
    include: {
      project: { select: { deletedAt: true } },
      publisher: { select: { deletedAt: true } },
    },
  });
  if (!target) {
    return { ok: false, status: 404, error: "Not found." };
  }

  if (target.project.deletedAt || target.publisher.deletedAt) {
    return { ok: false, status: 404, error: "Not found." };
  }

  if (target.status !== "active") {
    return { ok: false, status: 403, error: `This publish target is ${target.status}, not active.` };
  }

  const now = new Date();
  if (target.licenseStartsAt && now < target.licenseStartsAt) {
    return { ok: false, status: 403, error: "This publish target's license has not started yet." };
  }
  if (target.licenseEndsAt && now > target.licenseEndsAt) {
    return { ok: false, status: 403, error: "This publish target's license has expired." };
  }

  if (target.type === "embed" && target.allowedOrigins.length > 0) {
    const origin = request.headers.get("origin");
    if (origin && !target.allowedOrigins.includes(origin)) {
      return { ok: false, status: 403, error: "Origin not permitted for this publish target." };
    }
  }

  return { ok: true, target };
}
