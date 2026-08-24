import { normalizeProject3DConfigRow } from "@/lib/project3DConfig";
import type { ConstructionTimelineDraft, Project, Project3DConfig, Unit } from "@/lib/types";
import type { ProjectDetailModelSlotEntry } from "@/hooks/useProjectDetailModel";
import type { ViewerReleaseManifest, ViewerReleaseManifestModel } from "@/lib/publishing/compileRelease";
import type { PublicUnitDto } from "@/lib/viewer/inventoryDto";
import type { ProjectViewerRuntimeBootstrap } from "@/lib/viewer/runtimeTypes";

/**
 * Multi-Channel Publishing PRD Phase 5 — the manifest→bootstrap adapter
 * `WhiteLabelViewer.tsx`'s own doc comment (now superseded — see that
 * file) flagged as the real blocker for this phase. Each function here
 * is pure and independently reasoned about; `useEmbedBootstrap.ts` is the
 * only caller, but keeping the mapping logic itself free of fetch/React
 * concerns makes every one of these decisions inspectable on its own.
 */

/** One `ViewerReleaseManifestModel` → the shape `ProjectViewerRuntime`
 * actually reads off a detail-model entry. `fileSize`/`selectable`/
 * `transformLocked`/`materialCount`/`textureCount` aren't captured in a
 * compiled manifest and are confirmed (grepped `src/lib/render-engine` +
 * `src/components/project`) to have ZERO render-path readers — they're
 * admin-editor-inspector-only fields — so a placeholder here changes
 * nothing a visitor could ever see. `updatedAt` has no real per-model
 * timestamp in the manifest; `compiledAt` (the release's own timestamp)
 * is the closest honest value, also unread by any render path. */
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
      // `unitLinks`/`sceneManifest` are only present on a manifest
      // compiled after the Phase 5 schema addition (see
      // compileRelease.ts's own doc comment on those two fields) — a
      // pre-existing `ViewerRelease` row compiled before that falls back
      // to `[]`, same as this exact gap already worked for
      // `nodeOverrides`/live rows via `useProjectDetailModel`'s own
      // coalescing.
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

/** A public inventory row → the app's full `Unit` shape —
 * `ProjectViewerRuntime`'s tree (`UnitPreviewCard`/`UnitDiscoveryPanel`/
 * `units-workspace/*`) is written against `Unit`, not `PublicUnitDto`,
 * same seam `src/lib/units.ts`'s `normalizeUnit` already bridges for the
 * live-Postgres path — this is that same bridge for the public-DTO path.
 * `type`/`currency`/`status` are narrowed with a cast rather than
 * validated, same justification `normalizeUnit`'s own comment gives: this
 * DTO is only ever produced by `toPublicUnitDto()`, which only ever reads
 * from a `Unit` row that was itself already validated on the way in.
 * `transaction` has no equivalent in the public DTO (confirmed unread by
 * every component in this tree — see `inventoryDto.ts`'s own doc
 * comment) — `"sale"` is a placeholder, not a real value, flagged here so
 * it isn't mistaken for one. */
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
    // `PublicUnitDto.price` is nullable ("Price on Request", when a
    // channel's PublishTargetUnitOverride sets showPrice:false) but
    // `Unit.price` is a required number everywhere else in this app —
    // every consumer in ProjectViewerRuntime's tree (UnitPreviewCard/
    // units-workspace/*) formats it as a plain number
    // and has no "Price on Request" display path today. Coalescing to 0
    // rather than crashing on `.toLocaleString()` — a real, flagged
    // limitation (a white-label channel that hides a price shows "0"
    // instead of a message), not a silent one. Fixing this properly
    // means adding real "Price on Request" UI across ~6 components,
    // which needs visual iteration this environment can't do — left for
    // a session with a real browser rather than guessed at blind.
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

/**
 * Combines the bootstrap endpoint's project DTO (units deliberately
 * excluded — see the bootstrap route's own doc comment) with the
 * override-aware `/inventory` units into one real `Project`. Both
 * `bootstrap.project.units` and top-level `bootstrap.units` end up as the
 * exact same override-aware array/reference — `UnitDiscoveryPanel`
 * (currently dead code in `ProjectViewerRuntime`, see that file's own doc
 * comment, but still real/type-checked) reads `project.units` directly,
 * so it has to be override-safe too, not just the top-level field
 * `ThreeProjectViewer`/`UnitsWorkspace` read.
 */
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
