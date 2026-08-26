import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Multi-Channel Publishing PRD Phase 6 — bumps (or lazily creates) a
 * project's `ProjectInventoryState.revision`. Call after any write that
 * changes what the public inventory endpoint
 * (`/api/viewer/v1/t/[publicKey]/inventory`) would return — price, status,
 * or any other field that DTO surfaces — so a polling viewer's `If-None-
 * Match` check gets a real "something changed" signal (PRD §17/§19)
 * instead of silently serving a stale 304 forever. Upsert rather than a
 * bare `update`/`increment`, since most projects have no row yet — created
 * lazily here rather than backfilled for every existing project up front
 * (same reasoning as the model's own doc comment).
 *
 * Deliberately its own tiny function, not inlined at each call site — it's
 * wired into 3 separate Unit write routes (create/update/soft-delete) and
 * will grow more callers (PublishTargetUnitOverride writes, the future
 * Google Sheets sync) that should never have to remember the upsert shape.
 */
export async function bumpInventoryRevision(projectId: string): Promise<void> {
  await prisma.projectInventoryState.upsert({
    where: { projectId },
    create: { projectId, revision: BigInt(1) },
    update: { revision: { increment: 1 } },
  });
  await revalidatePublicProject(projectId);
}

/**
 * The other half of "something changed": the revision above is a signal a
 * *polling viewer* reads, but the public marketplace pages are statically
 * generated (`generateStaticParams` in `app/project/[slug]/page.tsx` and
 * `app/projects/[slug]/page.tsx`) from `getProjectBySlug`, which includes
 * the project's real `units`. With no revalidation those pages kept
 * serving build-time prices and availability indefinitely — so a Google
 * Sheet sync, or an edit in the admin's own inventory grid, changed the
 * database and changed nothing a buyer could see until the next deploy.
 *
 * Best-effort on purpose: `revalidatePath` throws outside a request/render
 * scope (a script, a test), and no inventory write should fail because a
 * cache hint could not be delivered. The revision bump above has already
 * committed by this point, which is the part that must not be lost.
 */
async function revalidatePublicProject(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });
    if (!project?.slug) return;
    // Both public surfaces that render a unit list: the 3D marketplace
    // viewer and the editorial project page.
    revalidatePath(`/project/${project.slug}`);
    revalidatePath(`/projects/${project.slug}`);
  } catch {
    // Non-fatal by design — see the doc comment above.
  }
}
