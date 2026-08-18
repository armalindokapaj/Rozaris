import { Prisma } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma";
import type { CameraPreset, ExperienceDocument, NodeOverride, Project3DConfig, Section, UnitMeshLink, ViewerUIToggles } from "./types";

const DEFAULT_VIEWER_UI: ViewerUIToggles = { home: true, unitSearch: true };

/** The subset of a `DetailModelVersion` row `buildExperienceDocument` needs
 * — deliberately narrow (not the whole Prisma row) so callers can pass
 * either a freshly-created row or a plain object without importing
 * generated Prisma types here. */
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

/**
 * Assembles one `ExperienceDocument` snapshot from the project's current
 * `Project3DConfig` row plus one `DetailModelVersion`'s own fields — the
 * one function that does this merge (rewrite Track B, Phase 1). Called at
 * version-create/update time so `DetailModelVersion.experienceDocument`
 * stays a faithful snapshot of what that revision actually looked like,
 * without requiring every existing config-writing route to change: this
 * is assembled *from* their output, not instead of it.
 */
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

/**
 * Re-reads a version's current state (its own fields + unit links + the
 * project's Project3DConfig) and rewrites its `experienceDocument`
 * snapshot — the shared refresh step every route that mutates a version's
 * placement/overrides/links calls after its own write, so the snapshot
 * doesn't silently go stale relative to the fields it's assembled from.
 * A project with no Project3DConfig row yet writes `null` (nothing reads
 * this document yet, so there's no default-config fallback to maintain).
 * Accepts a transaction client or the plain `prisma` client — every call
 * site already runs inside its own `$transaction`.
 */
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
  // Multiple Detail-Model Slots pass — the document's slotName is a
  // denormalized label (real slot management stays on DetailModelSlot,
  // this is just for a reader to know which slot a standalone document
  // describes without a second lookup). A missing slot (shouldn't happen,
  // slotId is a required FK) falls back to the raw id rather than
  // failing the whole refresh.
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
