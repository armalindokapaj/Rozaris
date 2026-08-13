import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";

const vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

const cameraPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: vector3Schema,
  target: vector3Schema,
  fov: z.number().min(10).max(120),
  durationMs: z.number().min(0).max(10_000),
});

const viewerUISchema = z.object({
  home: z.boolean(),
  unitSearch: z.boolean(),
  timeOfDay: z.boolean(),
  // Interaction toggles (full-configurator pass) — optional since existing
  // rows predate these keys; client-side default is `true` (see
  // ViewerUIToggles in src/lib/types.ts).
  hoverEnabled: z.boolean().optional(),
  selectEnabled: z.boolean().optional(),
  showUnitInfo: z.boolean().optional(),
  // Sections module — same optional/defaults-true pattern as the three
  // toggles above.
  sectionsEnabled: z.boolean().optional(),
});

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb hex color");

// Sections module — mirrors the `Section` TS interface (src/lib/types.ts)
// field-for-field; same validate-at-the-edge role cameraPresetSchema
// already plays for cameraPresets.
const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scope: z.enum(["project", "building"]),
  buildingName: z.string().optional(),
  centerX: z.number(),
  centerZ: z.number(),
  widthM: z.number().positive().max(500),
  depthM: z.number().positive().max(500),
  rotationDeg: z.number().min(-360).max(360),
  heightM: z.number().min(-50).max(500),
  bottomEnabled: z.boolean(),
  fillGapsEnabled: z.boolean(),
  fillColor: hexColorSchema,
  cameraPreset: z.object({ position: vector3Schema, target: vector3Schema, fov: z.number().min(10).max(120) }).optional(),
  floorId: z.string().optional(),
  hidden: z.boolean().optional(),
});

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
  groundStyle: z.enum(["disc", "infinite"]).optional(),
  groundColor: hexColorSchema.optional(),
  groundFogEnabled: z.boolean().optional(),
  groundFogRadius: z.number().min(1).max(20_000).optional(),
  cameraStartDistanceMultiplier: z.number().positive().max(10).optional(),
  cameraMinDistanceMultiplier: z.number().positive().max(10).optional(),
  cameraMaxDistanceMultiplier: z.number().positive().max(20).optional(),
  cameraMaxPolarDeg: z.number().min(0).max(180).optional(),
  cameraMinPolarDeg: z.number().min(0).max(180).optional(),
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
  simulationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
    .nullable()
    .optional(),
  cameraFovDesktop: z.number().min(10).max(120).optional(),
  cameraFovMobile: z.number().min(10).max(120).optional(),
  cameraPresets: z.array(cameraPresetSchema).optional(),
  exposure: z.number().min(0).max(4).optional(),
  viewerUI: viewerUISchema.optional(),
  hdriId: z.string().nullable().optional(),
  sunMode: z.enum(["geographic", "manual"]).optional(),
  sunAzimuthDeg: z.number().min(0).max(360).optional(),
  sunElevationDeg: z.number().min(-90).max(90).optional(),
  sunIntensity: z.number().min(0).max(4).optional(),
  fogEnabled: z.boolean().optional(),
  fogColor: hexColorSchema.optional(),
  fogDensity: z.number().min(0).max(0.1).optional(),
  fogMatchesSky: z.boolean().optional(),
  lensflareEnabled: z.boolean().optional(),
  lightProbeEnabled: z.boolean().optional(),
  sectionCapStencilEnabled: z.boolean().optional(),
  unitColorAvailable: hexColorSchema.optional(),
  unitColorReserved: hexColorSchema.optional(),
  unitColorSold: hexColorSchema.optional(),
  unitColorSelected: hexColorSchema.optional(),
  shadowsEnabled: z.boolean().optional(),
  antialiasEnabled: z.boolean().optional(),
  sections: z.array(sectionSchema).optional(),
  // Sky/Water/Bloom/Clouds pass — ranges mirror webgl_shaders_ocean.html's
  // own GUI folders exactly (Bloom strength 0-3/radius 0-1, Water
  // distortionScale 0-8/size 0.1-10, Clouds coverage/density/elevation
  // 0-1 each).
  bloomEnabled: z.boolean().optional(),
  bloomStrength: z.number().min(0).max(3).optional(),
  bloomRadius: z.number().min(0).max(1).optional(),
  waterEnabled: z.boolean().optional(),
  waterDistortionScale: z.number().min(0).max(8).optional(),
  waterSize: z.number().min(0.1).max(10).optional(),
  cloudsEnabled: z.boolean().optional(),
  cloudCoverage: z.number().min(0).max(1).optional(),
  cloudDensity: z.number().min(0).max(1).optional(),
  cloudElevation: z.number().min(0).max(1).optional(),
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
  if (!project || project.deletedAt) {
    return NextResponse.json(
      { error: `No project row for "${projectId}" — run \`npm run db:seed\`.` },
      { status: 404 }
    );
  }
  // Whole-row snapshot before the write — Project3DConfig is a 1:1
  // singleton (no version table of its own), so this row's audit history
  // IS its version history; restore-version PATCHes a past snapshot back.
  const previousConfig = await prisma.project3DConfig.findUnique({ where: { projectId } });

  // Cast needed for Prisma's Json input type on cameraPresets/viewerUI —
  // plain zod-inferred objects don't structurally satisfy
  // InputJsonObject's index signature without it (see the identical
  // comment on the sceneManifest/nodeOverrides writes in the
  // detail-models routes).
  const data = {
    ...parsed.data,
    cameraPresets: parsed.data.cameraPresets as unknown as Prisma.InputJsonValue,
    viewerUI: parsed.data.viewerUI as unknown as Prisma.InputJsonValue,
    sections: parsed.data.sections as unknown as Prisma.InputJsonValue,
  };
  const updated = await prisma.project3DConfig.upsert({
    where: { projectId },
    update: data,
    create: { projectId, ...data },
  });

  // Config changes (lighting/camera/effects/environment) are embedded in
  // every version's ExperienceDocument snapshot too — refresh the latest
  // version's so it doesn't go stale relative to the config it was built
  // from. Best-effort: a project with no versions yet has nothing to
  // refresh, which refreshExperienceDocument already handles (no-op).
  const latestVersion = await prisma.detailModelVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  if (latestVersion) await refreshExperienceDocument(prisma, projectId, latestVersion.id);

  const actor = gate.user?.email ?? gate.user?.name ?? "admin";
  await logAuditEvent({
    actor,
    actorId: gate.user?.id,
    action: "3D Experience config updated",
    entityType: "Project3DConfig",
    entityId: projectId,
    entityLabel: project.name,
    previousState: previousConfig,
    newState: updated,
  });

  return NextResponse.json(updated);
}
