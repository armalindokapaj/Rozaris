import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";

/**
 * "3D Experience Phase 1" — makes `Project3DConfig` real (it was 100% dead
 * before this pass: a Zustand-only record, zero API routes touching the
 * Postgres table of the same name — see the "3D Experience — Planpoint-
 * style rendering, Phase 1" plan). `GET` is public (every visitor's
 * `useProject3DConfig` reads it); `PATCH` is admin-gated via
 * `src/lib/adminAuth.ts`, same pattern as `/api/map-models/[projectId]`.
 * One mutable row per project (not versioned like the GLB pipelines —
 * this is live-editable scalar config, not an immutable asset upload).
 */
const patchSchema = z.object({
  lightingPreset: z.enum(["daylight", "overcast", "evening"]).optional(),
  backgroundPreset: z.enum(["sky", "studio_light", "studio_dark"]).optional(),
  groundEnabled: z.boolean().optional(),
  cameraStartDistanceMultiplier: z.number().positive().max(10).optional(),
  cameraMinDistanceMultiplier: z.number().positive().max(10).optional(),
  cameraMaxDistanceMultiplier: z.number().positive().max(20).optional(),
  cameraMaxPolarDeg: z.number().min(0).max(180).optional(),
  autoRotate: z.boolean().optional(),
  constructionStagesEnabled: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
  renderingMode: z.enum(["auto", "webgpu", "webgl2"]).optional(),
  qualityPreset: z.enum(["ultra_desktop", "high_desktop", "balanced", "mobile_high", "mobile_low"]).optional(),
  glassPreset: z.enum(["performance", "standard", "premium"]).optional(),
  skyPreset: z.enum(["clear_day", "soft_day", "overcast", "golden_hour", "evening"]).optional(),
  environmentIntensity: z.number().min(0).max(4).optional(),
  northRotationDeg: z.number().min(-360).max(360).optional(),
  defaultTimeOfDay: z.number().min(0).max(24).optional(),
  allowUserTimeChange: z.boolean().optional(),
  cameraFovDesktop: z.number().min(10).max(120).optional(),
  cameraFovMobile: z.number().min(10).max(120).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const config = await prisma.project3DConfig.findUnique({ where: { projectId } });
  return NextResponse.json(config);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }

  const updated = await prisma.project3DConfig.upsert({
    where: { projectId },
    update: parsed.data,
    create: { projectId, ...parsed.data },
  });

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    action: "3D Experience config updated",
    entityType: "Project3DConfig",
    entityId: projectId,
    entityLabel: project.name,
  });

  return NextResponse.json(updated);
}
