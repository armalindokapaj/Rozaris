import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { environmentPresetConfigSchema } from "@/lib/environmentPresetFields";

const patchPresetSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  // Both optional so the Presets tab can do a pure rename OR a
  // "update this preset to match my current draft" re-save without two
  // different routes.
  config: environmentPresetConfigSchema.optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ presetId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { presetId } = await params;
  const parsed = patchPresetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const preset = await prisma.environmentPreset.findUnique({ where: { id: presetId } });
  if (!preset) {
    return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  }

  let updated;
  try {
    updated = await prisma.environmentPreset.update({
      where: { id: presetId },
      data: { name: parsed.data.name, config: parsed.data.config as unknown as Prisma.InputJsonValue | undefined },
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: `A preset named "${parsed.data.name}" already exists.` }, { status: 409 });
    }
    throw err;
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Environment preset updated",
    entityType: "EnvironmentPreset",
    entityId: presetId,
    entityLabel: updated.name,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ presetId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { presetId } = await params;
  const preset = await prisma.environmentPreset.findUnique({ where: { id: presetId } });
  if (!preset) {
    return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  }

  await prisma.environmentPreset.delete({ where: { id: presetId } });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Environment preset deleted",
    entityType: "EnvironmentPreset",
    entityId: presetId,
    entityLabel: preset.name,
  });

  return NextResponse.json({ ok: true });
}
