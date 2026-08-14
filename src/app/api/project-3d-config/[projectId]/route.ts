import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { refreshExperienceDocument } from "@/lib/experienceDocument";
import { LUT_PRESET_IDS } from "@/lib/viewerPresets";

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
  // Real bug fix (2026-08-14, "resize doesn't save"): 500 was too tight
  // for a genuine "cut the whole project/site" section — the Resize
  // gizmo let an admin drag well past it (no client-side ceiling existed
  // either, see EditorShell.tsx's own fix), so the PATCH silently 400'd
  // and the edit never persisted. 5000m covers any real project's full
  // site footprint with headroom; still a real, finite sanity bound, not
  // `Infinity` (a > 5km "section" is certainly a mis-drag, not an
  // intentional cut).
  widthM: z.number().positive().max(5000),
  depthM: z.number().positive().max(5000),
  rotationDeg: z.number().min(-360).max(360),
  heightM: z.number().min(-50).max(500),
  bottomEnabled: z.boolean(),
  // Real user request ("I want only plane Y to clip") — see Section.
  // heightOnly's own doc comment in src/lib/types.ts.
  heightOnly: z.boolean().optional(),
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
  status: z.enum(["draft", "published"]).optional(),
  renderingMode: z.enum(["auto", "webgpu", "webgl2"]).optional(),
  qualityPreset: z.enum(["ultra_desktop", "high_desktop", "balanced", "mobile_high", "mobile_low"]).optional(),
  glassPreset: z.enum(["performance", "standard", "premium"]).optional(),
  environmentIntensity: z.number().min(0).max(4).optional(),
  cameraFovDesktop: z.number().min(10).max(120).optional(),
  cameraFovMobile: z.number().min(10).max(120).optional(),
  cameraPresets: z.array(cameraPresetSchema).optional(),
  exposure: z.number().min(0).max(4).optional(),
  viewerUI: viewerUISchema.optional(),
  // Sky/Water/Bloom/Clouds "Ocean" tab — direct sun elevation/azimuth,
  // the only sun model now (the old geographic-sun/HDRI/lensflare/
  // light-probe/motion-blur system was removed entirely 2026-08-14, see
  // Project3DConfig's own doc comment in src/lib/types.ts).
  sunAzimuthDeg: z.number().min(0).max(360).optional(),
  sunElevationDeg: z.number().min(-90).max(90).optional(),
  // Standalone "Sky" tab (webgl_shaders_sky.html parity) — ranges mirror
  // the reference demo's own GUI sliders exactly (turbidity 0-20,
  // rayleigh/mieDirectionalG 0-4/0-1, mieCoefficient 0-0.1). `skyEnabled`
  // is a Rozaris-specific addition, the demo has no off switch.
  skyEnabled: z.boolean().optional(),
  skyTurbidity: z.number().min(0).max(20).optional(),
  skyRayleigh: z.number().min(0).max(4).optional(),
  skyMieCoefficient: z.number().min(0).max(0.1).optional(),
  skyMieDirectionalG: z.number().min(0).max(1).optional(),
  fogEnabled: z.boolean().optional(),
  fogColor: hexColorSchema.optional(),
  fogDensity: z.number().min(0).max(0.1).optional(),
  fogMatchesSky: z.boolean().optional(),
  unitColorAvailable: hexColorSchema.optional(),
  unitColorReserved: hexColorSchema.optional(),
  unitColorSold: hexColorSchema.optional(),
  unitColorSelected: hexColorSchema.optional(),
  // Unit-status caustics (webgpu_caustics.html parity, adapted).
  causticsEnabled: z.boolean().optional(),
  causticsScale: z.number().min(0.05).max(3).optional(),
  causticsSpeed: z.number().min(0).max(1).optional(),
  causticsIntensityAvailable: z.number().min(0).max(3).optional(),
  causticsIntensityReserved: z.number().min(0).max(3).optional(),
  causticsIntensitySold: z.number().min(0).max(3).optional(),
  shadowsEnabled: z.boolean().optional(),
  antialiasEnabled: z.boolean().optional(),
  sections: z.array(sectionSchema).optional(),
  // Sky/Water/Bloom/Clouds "Ocean" tab — ranges mirror
  // webgl_shaders_ocean.html's own GUI folders exactly (Bloom strength
  // 0-3/radius 0-1, Water distortionScale 0-8/size 0.1-10, Clouds
  // coverage/density/elevation 0-1 each). `bloomThreshold`/
  // `volumetricCloud*` removed entirely 2026-08-14 — see
  // Project3DConfig's own doc comment.
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
  shadowSoftness: z.number().min(0).max(10).optional(),
  // 3D LUT (webgl_postprocessing_3dlut.html parity) — lutPreset is
  // validated against the real vendored preset list (all 9 of the
  // reference demo's own presets), not a free string.
  lutEnabled: z.boolean().optional(),
  lutPreset: z.enum(LUT_PRESET_IDS).optional(),
  lutIntensity: z.number().min(0).max(1).optional(),
  logarithmicDepthEnabled: z.boolean().optional(),
  loadingRevealEnabled: z.boolean().optional(),
  // Depth of field (webgl_postprocessing_dof2.html parity).
  depthOfFieldEnabled: z.boolean().optional(),
  depthOfFieldFocalLength: z.number().min(0.1).max(200).optional(),
  depthOfFieldBokehScale: z.number().min(0).max(5).optional(),
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
