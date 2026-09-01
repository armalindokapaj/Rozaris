import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["project_admin", "inventory_manager", "sales_manager", "analytics_viewer"]),
});

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const members = await prisma.projectMembership.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(members);
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = addMemberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ error: `No account found for "${parsed.data.email}".` }, { status: 404 });
  }

  let membership;
  try {
    membership = await prisma.projectMembership.create({
      data: { projectId, userId: user.id, role: parsed.data.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: `${user.email} already has access to this project.` }, { status: 409 });
    }
    throw err;
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Project member added",
    entityType: "ProjectMembership",
    entityId: membership.id,
    entityLabel: `${project.name} · ${user.email} (${parsed.data.role})`,
    metadata: { projectId, userId: user.id, role: parsed.data.role },
  });

  return NextResponse.json(membership);
}
