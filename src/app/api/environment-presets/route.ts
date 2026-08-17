import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { environmentPresetConfigSchema } from "@/lib/environmentPresetFields";

const createPresetSchema = z.object({
  name: z.string().min(1).max(60),
  config: environmentPresetConfigSchema,
});

/**
 * Environment Presets library — global (no projectId), reusable across
 * every project. Purely an internal admin tool (unlike
 * /api/project-3d-config's GET, this is never read by the public viewer),
 * so both GET and POST are requireAdmin()-gated, same convention as
 * /api/detail-models/[projectId]/slots.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const presets = await prisma.environmentPreset.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(presets);
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createPresetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  let preset;
  try {
    preset = await prisma.environmentPreset.create({
      data: {
        name: parsed.data.name,
        config: parsed.data.config as unknown as Prisma.InputJsonValue,
        createdBy: actor,
      },
    });
  } catch (err: unknown) {
    // Prisma P2002 — the @unique name constraint. A named "collision" is a
    // real, expected user action (typo'd the same name twice), not a server
    // error — surfaced as a normal 409 the Presets tab can show inline.
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: `A preset named "${parsed.data.name}" already exists.` }, { status: 409 });
    }
    throw err;
  }

  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "Environment preset created",
    entityType: "EnvironmentPreset",
    entityId: preset.id,
    entityLabel: preset.name,
  });

  return NextResponse.json(preset);
}
