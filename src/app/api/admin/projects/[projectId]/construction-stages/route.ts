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
  stages: z.array(stageSchema).max(30),
});

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
    const stages = await prisma.$transaction(async (tx) => {
      await tx.constructionStage.deleteMany({ where: { projectId } });
      if (parsed.data.stages.length > 0) {
        await tx.constructionStage.createMany({
          data: parsed.data.stages.map((stage, index) => ({ ...stage, order: index, projectId })),
        });
      }
      return tx.constructionStage.findMany({ where: { projectId }, orderBy: { order: "asc" } });
    });

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
