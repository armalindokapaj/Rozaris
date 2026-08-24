import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { logApiError } from "@/lib/apiErrorLog";

const stageSchema = z.object({
  name: z.string().min(1, "A stage needs a name."),
  status: z.enum(["done", "active", "upcoming"]),
  progressPercent: z.number().int().min(0).max(100),
  dateLabel: z.string().max(60).optional().default(""),
});

const bodySchema = z.object({
  // The whole list, in display order — a replace, not a per-row patch.
  // These rows have no meaning individually (they're a sequence), the set
  // is small, and reordering under a per-row API would mean N writes with
  // a half-reordered timeline visible in between.
  stages: z.array(stageSchema).max(30),
});

/**
 * A project's construction timeline — the stage list shown on the public
 * project page (`ConstructionTimelineStrip`).
 *
 * `ConstructionStage` rows had existed since the first schema but were
 * written ONLY by `prisma/seed.ts`: no admin surface, no API. So any
 * project created through the console (rather than seeded) had a
 * permanently empty timeline, and no seeded project's timeline could ever
 * be corrected. This is that missing write path, added alongside the
 * Project Manager's Timeline section.
 *
 * Note the separate, pre-existing `ConstructionTimelineRequest` flow: that
 * is the PUBLISHER asking for a progress change and an admin approving it
 * (still Zustand-backed). This route is the admin editing the stages
 * directly, which they could not do at all before.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const stages = await prisma.constructionStage.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(stages);
}

export async function PUT(
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, slug: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const previous = await prisma.constructionStage.findMany({ where: { projectId }, orderBy: { order: "asc" } });

  try {
    // One transaction: a failure halfway through must not leave the
    // project with the old stages deleted and the new ones unwritten —
    // i.e. no timeline at all on a live public page.
    const stages = await prisma.$transaction(async (tx) => {
      await tx.constructionStage.deleteMany({ where: { projectId } });
      if (parsed.data.stages.length > 0) {
        await tx.constructionStage.createMany({
          data: parsed.data.stages.map((stage, index) => ({ ...stage, order: index, projectId })),
        });
      }
      return tx.constructionStage.findMany({ where: { projectId }, orderBy: { order: "asc" } });
    });

    // Same ISR staleness every other project write here has to handle —
    // see the publication route's own comment.
    revalidatePath(`/project/${project.slug}`);
    revalidatePath(`/projects/${project.slug}`);

    const actor = gate.user?.email ?? gate.user?.name ?? "admin";
    await logAuditEvent({
      actor,
      actorId: gate.user?.id,
      action: "Construction timeline updated",
      entityType: "Project",
      entityId: projectId,
      entityLabel: project.name,
      previousState: { stages: previous },
      newState: { stages },
      metadata: { projectId },
    });

    return NextResponse.json(stages);
  } catch (err) {
    await logApiError(`/api/admin/projects/${projectId}/construction-stages`, err, gate.user?.email ?? undefined);
    return NextResponse.json({ error: "Could not save the construction timeline." }, { status: 500 });
  }
}
