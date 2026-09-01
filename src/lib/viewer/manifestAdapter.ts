import { normalizeProject3DConfigRow } from "@/lib/project3DConfig";
import type { ConstructionTimelineDraft, Project, Project3DConfig, Unit } from "@/lib/types";
import type { ProjectDetailModelSlotEntry } from "@/hooks/useProjectDetailModel";
import type { ViewerReleaseManifest, ViewerReleaseManifestModel } from "@/lib/publishing/compileRelease";
import type { PublicUnitDto } from "@/lib/viewer/inventoryDto";
import type { ProjectViewerRuntimeBootstrap } from "@/lib/viewer/runtimeTypes";

function manifestModelToDetailModelEntry(
  m: ViewerReleaseManifestModel,
  compiledAt: string
): ProjectDetailModelSlotEntry {
  return {
    slotId: m.slotId,
    slotName: m.slotName,
    slotRole: m.role as ProjectDetailModelSlotEntry["slotRole"],
    transformParentSlotId: m.transformParentSlotId,
    model: {
      glbUrl: m.url,
      fileName: m.fileName,
      fileSize: 0,
      scale: m.transform.scale,
      rotationDeg: m.transform.rotationDeg,
      altitudeOffset: m.transform.altitudeOffset,
      positionX: m.transform.positionX,
      positionZ: m.transform.positionZ,
      rotationXDeg: m.transform.rotationXDeg,
      rotationZDeg: m.transform.rotationZDeg,
      enabled: m.enabled,
      visible: m.visible,
      castShadow: m.castShadow,
      receiveShadow: m.receiveShadow,
      selectable: true,
      transformLocked: false,
      updatedAt: compiledAt,
      unitLinks: (m.unitLinks ?? []).map((l) => ({
        meshName: l.meshName,
        unitId: l.unitId,
        poiYawDeg: l.poiYawDeg,
        poiEnabled: l.poiEnabled,
        poiDistanceOverride: l.poiDistanceOverride,
        poiHeightOverride: l.poiHeightOverride,
      })),
      sceneManifest: (m.sceneManifest as ProjectDetailModelSlotEntry["model"]["sceneManifest"]) ?? [],
      nodeOverrides: (m.nodeOverrides as ProjectDetailModelSlotEntry["model"]["nodeOverrides"]) ?? [],
      triangleCount: m.triangleCount,
      meshCount: m.meshCount,
      materialCount: null,
      textureCount: null,
    },
  };
}

export function manifestToDetailModels(manifest: ViewerReleaseManifest): ProjectDetailModelSlotEntry[] {
  return manifest.models.map((m) => manifestModelToDetailModelEntry(m, manifest.compiledAt));
}

export function manifestToProject3DConfig(manifest: ViewerReleaseManifest): Project3DConfig {
  return normalizeProject3DConfigRow(manifest.rendering as Partial<Project3DConfig>);
}

export function publicUnitDtoToUnit(dto: PublicUnitDto): Unit {
  return {
    id: dto.id,
    code: dto.code,
    type: dto.type as Unit["type"],
    buildingName: dto.buildingName,
    floor: dto.floor,
    area: dto.area,
    bedrooms: dto.bedrooms,
    bathrooms: dto.bathrooms,
    price: dto.price ?? 0,
    currency: dto.currency as Unit["currency"],
    transaction: "sale",
    status: dto.status as Unit["status"],
    images: dto.images,
    floorPlanImage: dto.floorPlanImage ?? "",
    facadeImage: dto.facadeImage ?? undefined,
    videoUrl: dto.videoUrl ?? undefined,
  };
}

export function buildWhiteLabelBootstrap(
  publicProject: Omit<Project, "units">,
  manifest: ViewerReleaseManifest,
  inventoryUnits: PublicUnitDto[]
): ProjectViewerRuntimeBootstrap {
  const units = inventoryUnits.map(publicUnitDtoToUnit);
  const project: Project = { ...publicProject, units };
  const construction: ConstructionTimelineDraft = {
    progressPercent: project.progressPercent,
    stages: project.constructionStages,
  };

  return {
    project,
    construction,
    detailModels: manifestToDetailModels(manifest),
    viewerConfig: manifestToProject3DConfig(manifest),
    units,
  };
}
