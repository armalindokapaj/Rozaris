import { prisma } from "@/lib/db";

export interface ViewerReleaseReadiness {
  ready: boolean;
  blocking: string[];
  warnings: string[];
}

/**
 * Multi-Channel Publishing PRD Phase 3, §67 "Admin publish readiness
 * engine" / §34 "Release panel". Read-only — no writes, safe to call
 * repeatedly while an admin fixes issues (the future Distribution UI's
 * checklist) and again server-side right before compileRelease() actually
 * creates a release (never trust a client's earlier readiness check).
 *
 * Deliberately checks PUBLISHED state, not live draft state — "editor
 * state ≠ production state" (PRD §3) is the whole point of this pass. A
 * slot with unpublished draft edits sitting on top of a perfectly good
 * published version is fine; a slot that's never been published at all is
 * blocking.
 */
export async function validateViewerRelease(projectId: string): Promise<ViewerReleaseReadiness> {
  const blocking: string[] = [];
  const warnings: string[] = [];

  const [config, slots] = await Promise.all([
    prisma.project3DConfig.findUnique({ where: { projectId } }),
    prisma.detailModelSlot.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        versions: {
          where: { publicationStatus: "published", deletedAt: null },
          // App-enforced invariant elsewhere (every publish route demotes
          // the sibling first) — at most one row here, but don't assume a
          // DB-level guarantee; take the latest if that invariant were
          // ever violated.
          orderBy: { version: "desc" },
          take: 1,
          include: { unitLinks: true },
        },
      },
    }),
  ]);

  if (!config) {
    blocking.push("Project has no 3D Experience configuration yet.");
  }

  if (slots.length === 0) {
    blocking.push("Project has no 3D model slots — nothing to release.");
  }

  let needsReviewCount = 0;
  for (const slot of slots) {
    const published = slot.versions[0];
    if (!published) {
      blocking.push(`Slot "${slot.name}" has no published version.`);
      continue;
    }
    if (published.validationStatus === "blocked") {
      blocking.push(`Slot "${slot.name}"'s published version (v${published.version}) has unresolved validation issues.`);
    } else if (published.validationStatus === "warning") {
      warnings.push(`Slot "${slot.name}"'s published version (v${published.version}) has minor validation warnings.`);
    }
    needsReviewCount += published.unitLinks.filter((l) => l.mappingStatus === "needs_review").length;
  }

  // Informational, not blocking — an admin may legitimately release a
  // project before every last unit mesh is confirmed (PRD's own readiness
  // panel example shows this as a checklist item, not stated as a hard
  // gate elsewhere in the PRD).
  if (needsReviewCount > 0) {
    warnings.push(`${needsReviewCount} unit mesh mapping${needsReviewCount === 1 ? "" : "s"} still need review.`);
  }

  return { ready: blocking.length === 0, blocking, warnings };
}
