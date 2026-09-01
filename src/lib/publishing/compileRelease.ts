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
  sceneManifest: unknown;
  unitLinks: Array<{
    meshName: string;
    unitId: string;
    poiYawDeg: number;
    poiEnabled: boolean;
    poiDistanceOverride: number | null;
    poiHeightOverride: number | null;
  }>;
}

export interface ViewerReleaseManifest {
  schemaVersion: 1;
  projectId: string;
  compiledAt: string;
  models: ViewerReleaseManifestModel[];
  unitBindings: Record<string, string>;
  unitPoi: Record<
    string,
    { yawDeg: number; enabled: boolean; distanceOverride: number | null; heightOverride: number | null }
  >;
  rendering: Record<string, unknown>;
}

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
      sceneManifest: published.sceneManifest,
      unitLinks: published.unitLinks.map((link) => ({
        meshName: link.meshName,
        unitId: link.unitId,
        poiYawDeg: link.poiYawDeg,
        poiEnabled: link.poiEnabled,
        poiDistanceOverride: link.poiDistanceOverride,
        poiHeightOverride: link.poiHeightOverride,
      })),
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
