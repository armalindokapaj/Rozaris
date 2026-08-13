import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { MapModelVersion } from "@/generated/prisma";

/**
 * Public read of every project's currently-*published* "3D Map Control"
 * placement — resolved from the versioned `MapModelVersion` table (see
 * ./[projectId]/versions for the full history/draft/publish/rollback
 * pipeline) rather than the legacy single-row `ProjectMapModel` table this
 * route used before the versioning pass. Response shape is kept identical
 * to before (`projectId/glbUrl/fileName/.../enabled/updatedAt`) so every
 * existing consumer (MapView.tsx's useProjectMapModels(), last session's
 * ThreeDExperiencesTab/InventoryTab) needs zero changes.
 */
function toLegacyShape(v: MapModelVersion) {
  return {
    projectId: v.projectId,
    glbUrl: v.publicAssetUrl,
    fileName: v.fileName,
    fileSize: v.fileSize,
    scale: v.scale,
    rotationDeg: v.heading,
    altitudeOffset: v.altitude,
    // Multi-building-pick + reposition pass — was hardcoded to the
    // project's own coordinates by every consumer before this (these
    // columns were write-only); now the actual, possibly-dragged position.
    lng: v.longitude,
    lat: v.latitude,
    enabled: v.publicationStatus === "published",
    hideBaseBuilding: v.hideBaseBuilding,
    hiddenBuildings: v.hiddenBuildings ?? [],
    updatedAt: v.updatedAt,
  };
}

export async function GET() {
  const models = await prisma.mapModelVersion.findMany({
    where: { publicationStatus: "published", deletedAt: null },
  });
  return NextResponse.json(models.map(toLegacyShape));
}
