import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const bodySchema = z.object({
  approvalStatus: z.enum(["pending", "active", "archived"]),
  reason: z.string().optional(),
});

/**
 * Read-only companion to PATCH below — the admin "3D Platform" project
 * grid (src/app/admin/page.tsx's `Project3DGrid`) needs each card's live
 * visibility state (Active / Hidden / Recycle Bin) to render a status
 * badge and enable/disable the right menu actions; `Project3DGrid`'s own
 * `allProjects` comes from mockData.ts + Zustand, neither of which carries
 * `approvalStatus`/`deletedAt` (DB-only fields), so this can't be read
 * client-side without a real fetch.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { approvalStatus: true, deletedAt: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(project);
}

/**
 * "Force unpublish/republish" for Project — `approvalStatus` already had
 * `archived` in the schema, just never driven by an admin route (only
 * `pending`/`active` were ever written, at creation time). `archived`
 * transitions require a reason (unpublish is high-risk per PRD §14);
 * moving back to `active` doesn't strictly need one but accepts it anyway
 * for context ("why was this republished").
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.approvalStatus === "archived" && !parsed.data.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required to unpublish a project." }, { status: 400 });
  }

  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      // Real "reviewed" timestamp — see the matching note on the Listing
      // publication route; this is what makes an approval-SLA report real
      // instead of a fabricated number.
      data: { approvalStatus: parsed.data.approvalStatus, reviewedAt: new Date() },
    });

    // The DB write above is the source of truth, but `/project/[slug]` and
    // `/projects/[slug]` are ISR pages (generateStaticParams + no
    // `revalidate` export) — a slug not yet in the build-time static list
    // renders on first visit and then caches indefinitely, `dynamicParams`
    // or not. A project approved *after* someone (often its own admin,
    // testing) already hit its page while `pending` gets stuck serving
    // that cached "not found" render forever, even though this write just
    // made it real. Same story in reverse for `archived`. `/new-projects`
    // has no dynamic segment at all, so it's fully static from the last
    // deploy — any approvalStatus change makes it stale too. Real bug hit
    // live: DB flipped to `active`, public catalog (client-fetched, never
    // cached) picked it up immediately, this page didn't.
    revalidatePath(`/project/${updated.slug}`);
    revalidatePath(`/projects/${updated.slug}`);
    revalidatePath("/new-projects");

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action:
        parsed.data.approvalStatus === "archived"
          ? "Project force-unpublished"
          : `Project publication state → ${parsed.data.approvalStatus}`,
      entityType: "Project",
      entityId: projectId,
      entityLabel: existing.name,
      reason: parsed.data.reason,
      previousState: existing,
      newState: updated,
    });

    return NextResponse.json(updated);
  } catch (err) {
    await logApiError(`/api/admin/projects/${projectId}/publication`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
