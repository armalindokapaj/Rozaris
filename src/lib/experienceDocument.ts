import { Prisma } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma";
import type { CameraPreset, ExperienceDocument, NodeOverride, Project3DConfig, Section, UnitMeshLink, ViewerUIToggles } from "./types";

const DEFAULT_VIEWER_UI: ViewerUIToggles = { home: true, unitSearch: true };

export interface ExperienceDocumentVersionInput {
  projectId: string;
  slotId: string;
  slotName: string;
  version: number;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  nodeOverrides: NodeOverride[];
  unitLinks: UnitMeshLink[];
  publicationStatus: "draft" | "published" | "archived";
  validationStatus: "ready" | "warning" | "blocked";
}

export function buildExperienceDocument(
  config: Project3DConfig,
  version: ExperienceDocumentVersionInput
): ExperienceDocument {
  return {
    schemaVersion: 1,
    projectId: version.projectId,
    slotId: version.slotId,
    slotName: version.slotName,
    revision: version.version,
    model: {
      scale: version.scale,
      rotationDeg: version.rotationDeg,
      altitudeOffset: version.altitudeOffset,
    },
    materials: {
      overrides: version.nodeOverrides,
    },
    environment: {
      environmentIntensity: config.environmentIntensity,
    },
    lighting: {
      sunAzimuthDeg: config.sunAzimuthDeg,
      sunElevationDeg: config.sunElevationDeg,
    },
    camera: {
      presets: config.cameraPresets as CameraPreset[],
      fovDesktop: config.cameraFovDesktop,
      fovMobile: config.cameraFovMobile,
      startDistanceMultiplier: config.cameraStartDistanceMultiplier,
      minDistanceMultiplier: config.cameraMinDistanceMultiplier,
      maxDistanceMultiplier: config.cameraMaxDistanceMultiplier,
      maxPolarDeg: config.cameraMaxPolarDeg,
      autoRotate: config.autoRotate,
      idleDrone: {
        enabled: config.idleDroneEnabled,
        delaySec: config.idleDroneDelaySec,
        orbitDurationSec: config.idleDroneOrbitDurationSec,
        clockwise: config.idleDroneClockwise,
        motionEnabled: config.idleDroneMotionEnabled,
        height: { enabled: config.idleDroneHeightEnabled, amplitude: config.idleDroneHeightAmplitude },
        distance: { enabled: config.idleDroneDistanceEnabled, amplitude: config.idleDroneDistanceAmplitude },
        target: { enabled: config.idleDroneTargetEnabled, amplitude: config.idleDroneTargetAmplitude },
        verticalCycles: config.idleDroneVerticalCycles,
        phaseOffsetDeg: config.idleDronePhaseOffsetDeg,
        smoothness: config.idleDroneSmoothness,
      },
    },
    effects: {
      qualityPreset: config.qualityPreset,
      renderingMode: config.renderingMode,
      glassPreset: config.glassPreset,
      exposure: config.exposure,
      toneMapping: config.toneMapping,
    },
    units: {
      bindings: version.unitLinks,
    },
    sections: config.sections,
    viewer: config.viewerUI,
    publishing: {
      publicationStatus: version.publicationStatus,
      validationStatus: version.validationStatus,
    },
  };
}

export async function refreshExperienceDocument(
  tx: Pick<PrismaClient, "detailModelVersion" | "project3DConfig" | "detailModelSlot">,
  projectId: string,
  versionId: string
): Promise<void> {
  const [version, config3d] = await Promise.all([
    tx.detailModelVersion.findUnique({ where: { id: versionId }, include: { unitLinks: true } }),
    tx.project3DConfig.findUnique({ where: { projectId } }),
  ]);
  if (!version) return;
  const slot = await tx.detailModelSlot.findUnique({ where: { id: version.slotId } });

  const experienceDocument = config3d
    ? buildExperienceDocument(
        {
          ...config3d,
          cameraPresets: (config3d.cameraPresets as unknown as CameraPreset[]) ?? [],
          viewerUI: (config3d.viewerUI as unknown as ViewerUIToggles) ?? DEFAULT_VIEWER_UI,
          sections: (config3d.sections as unknown as Section[]) ?? [],
        } as unknown as Project3DConfig,
        {
          projectId,
          slotId: version.slotId,
          slotName: slot?.name ?? version.slotId,
          version: version.version,
          scale: version.scale,
          rotationDeg: version.rotationDeg,
          altitudeOffset: version.altitudeOffset,
          nodeOverrides: (version.nodeOverrides as unknown as NodeOverride[]) ?? [],
          unitLinks: version.unitLinks.map((l) => ({ meshName: l.meshName, unitId: l.unitId, poiYawDeg: l.poiYawDeg })),
          publicationStatus: version.publicationStatus,
          validationStatus: version.validationStatus,
        }
      )
    : null;

  await tx.detailModelVersion.update({
    where: { id: versionId },
    data: { experienceDocument: (experienceDocument as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull },
  });
}
