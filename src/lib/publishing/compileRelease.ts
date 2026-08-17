import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

export interface ViewerReleaseManifestModel {
  role: string;
  slotId: string;
  slotName: string;
  transformParentSlotId: string | null;
  versionId: string;
  version: number;
  url: string;
  fileName: string;
  triangleCount: number | null;
  meshCount: number | null;
  transform: {
    scale: number;
    rotationDeg: number;
    altitudeOffset: number;
    positionX: number;
    positionZ: number;
    rotationXDeg: number;
    rotationZDeg: number;
  };
  enabled: boolean;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  nodeOverrides: unknown;
}

export interface ViewerReleaseManifest {
  schemaVersion: 1;
  projectId: string;
  compiledAt: string;
  models: ViewerReleaseManifestModel[];
  /** meshName -> real Unit id, merged across every included model — the
   * runtime's raycast-hit-to-Unit lookup (PRD §5's `unitBindings`). Deliberately
   * excludes price/availability/anything else Unit-shaped — those stay live
   * (PRD §5-6 "separate static experience from live inventory"), fetched by
   * the viewer from the inventory endpoint (Phase 6), never baked in here. */
  unitBindings: Record<string, string>;
  /** unitId -> the one thing this schema lets an admin author per unit
   * (UnitMeshLinkV2's own doc comment) — POI camera facing/overrides. */
  unitPoi: Record<
    string,
    { yawDeg: number; enabled: boolean; distanceOverride: number | null; heightOverride: number | null }
  >;
  /** Full current Project3DConfig snapshot at compile time (minus its own
   * id/bookkeeping columns) — deliberately NOT the narrow hand-picked field
   * set `buildExperienceDocument()` uses (that allowlist already predates
   * several rendering tabs — Ocean/Water/Clouds/GI/Volumetrics aren't in it
   * — and a release manifest going stale the same way the moment a new tab
   * ships is a worse failure mode than one extra unused field). */
  rendering: Record<string, unknown>;
}

/**
 * Multi-Channel Publishing PRD Phase 3 — turns a project's current
 * PUBLISHED 3D state into one immutable `ViewerRelease` row. Does NOT
 * itself check readiness — callers must run `validateViewerRelease()`
 * first and refuse to call this when `ready` is false (the one real call
 * site, `POST /api/admin/projects/[projectId]/releases`, does exactly
 * that). Kept as two single-purpose functions rather than one, per
 * validateRelease.ts's own doc comment about being safe to poll
 * repeatedly — compiling should never be a side effect of just checking.
 */
export async function compileViewerRelease(projectId: string, actor: string) {
  const [config, slots, lastRelease] = await Promise.all([
    prisma.project3DConfig.findUnique({ where: { projectId } }),
    prisma.detailModelSlot.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      include: {
        versions: {
          where: { publicationStatus: "published", deletedAt: null },
          orderBy: { version: "desc" },
          take: 1,
          include: { unitLinks: true },
        },
      },
    }),
    prisma.viewerRelease.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { version: true } }),
  ]);

  if (!config) {
    throw new Error("Cannot compile a release: project has no 3D Experience configuration.");
  }

  const models: ViewerReleaseManifestModel[] = [];
  const unitBindings: Record<string, string> = {};
  const unitPoi: ViewerReleaseManifest["unitPoi"] = {};

  for (const slot of slots) {
    const published = slot.versions[0];
    if (!published) {
      // validateViewerRelease() should have already blocked this — defensive,
      // not the normal path.
      throw new Error(`Cannot compile a release: slot "${slot.name}" has no published version.`);
    }
    models.push({
      role: slot.role,
      slotId: slot.id,
      slotName: slot.name,
      transformParentSlotId: slot.transformParentSlotId,
      versionId: published.id,
      version: published.version,
      url: published.publicAssetUrl,
      fileName: published.fileName,
      triangleCount: published.triangleCount,
      meshCount: published.meshCount,
      transform: {
        scale: published.scale,
        rotationDeg: published.rotationDeg,
        altitudeOffset: published.altitudeOffset,
        positionX: published.positionX,
        positionZ: published.positionZ,
        rotationXDeg: published.rotationXDeg,
        rotationZDeg: published.rotationZDeg,
      },
      enabled: published.modelEnabled,
      visible: published.modelVisible,
      castShadow: published.castShadow,
      receiveShadow: published.receiveShadow,
      nodeOverrides: published.nodeOverrides,
    });

    for (const link of published.unitLinks) {
      unitBindings[link.meshName] = link.unitId;
      unitPoi[link.unitId] = {
        yawDeg: link.poiYawDeg,
        enabled: link.poiEnabled,
        distanceOverride: link.poiDistanceOverride,
        heightOverride: link.poiHeightOverride,
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { projectId: _pid, updatedAt: _updatedAt, ...renderingFields } = config;

  const manifest: ViewerReleaseManifest = {
    schemaVersion: 1,
    projectId,
    compiledAt: new Date().toISOString(),
    models,
    unitBindings,
    unitPoi,
    rendering: renderingFields as unknown as Record<string, unknown>,
  };

  const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const nextVersion = (lastRelease?.version ?? 0) + 1;

  return prisma.viewerRelease.create({
    data: {
      projectId,
      version: nextVersion,
      status: "ready",
      manifest: manifest as unknown as Prisma.InputJsonValue,
      manifestHash,
      createdBy: actor,
      validatedAt: new Date(),
    },
  });
}
