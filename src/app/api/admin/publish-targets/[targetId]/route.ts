import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent, diffState } from "@/lib/audit";

const patchTargetSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(["draft", "active", "suspended", "expired"]).optional(),
  customDomain: z.string().min(1).max(255).nullable().optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  viewerOverrides: z.record(z.string(), z.unknown()).optional(),
  licenseStartsAt: z.coerce.date().nullable().optional(),
  licenseEndsAt: z.coerce.date().nullable().optional(),
  reason: z.string().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { targetId } = await params;
  const parsed = patchTargetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.projectPublishTarget.findUnique({ where: { id: targetId } });
  if (!existing) {
    return NextResponse.json({ error: "Publish target not found." }, { status: 404 });
  }

  const { reason, ...fields } = parsed.data;
  const updated = await prisma.projectPublishTarget.update({
    where: { id: targetId },
    data: {
      name: fields.name,
      status: fields.status,
      customDomain: fields.customDomain,
      allowedOrigins: fields.allowedOrigins,
      branding: fields.branding as Prisma.InputJsonValue | undefined,
      viewerOverrides: fields.viewerOverrides as Prisma.InputJsonValue | undefined,
      licenseStartsAt: fields.licenseStartsAt,
      licenseEndsAt: fields.licenseEndsAt,
    },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action:
      fields.status && fields.status !== existing.status
        ? `Publish target ${fields.status}`
        : "Publish target updated",
    entityType: "ProjectPublishTarget",
    entityId: updated.id,
    entityLabel: updated.name,
    reason,
    previousState: existing,
    newState: updated,
    metadata: { projectId: updated.projectId, changedFields: diffState(existing, updated).map((c) => c.field) },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ targetId: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { targetId } = await params;
  const existing = await prisma.projectPublishTarget.findUnique({ where: { id: targetId } });
  if (!existing) {
    return NextResponse.json({ error: "Publish target not found." }, { status: 404 });
  }

  await prisma.projectPublishTarget.delete({ where: { id: targetId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Publish target deleted",
    entityType: "ProjectPublishTarget",
    entityId: targetId,
    entityLabel: existing.name,
    previousState: existing,
    metadata: { projectId: existing.projectId },
  });

  return NextResponse.json({ ok: true });
}
