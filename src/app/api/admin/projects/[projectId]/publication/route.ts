import { NextResponse } from "next/server";
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
      data: { approvalStatus: parsed.data.approvalStatus },
    });

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
