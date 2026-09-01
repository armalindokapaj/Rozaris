import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const slots = await prisma.detailModelSlot.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const models = await Promise.all(
    slots.map(async (slot) => {
      const version = await prisma.detailModelVersion.findFirst({
        where: { slotId: slot.id, publicationStatus: "published", deletedAt: null },
        include: { unitLinks: true },
      });
      if (!version) return null;
      return {
        slotId: slot.id,
        slotName: slot.name,
        slotRole: slot.role,
        transformParentSlotId: slot.transformParentSlotId,
        model: {
          glbUrl: version.publicAssetUrl,
          fileName: version.fileName,
          fileSize: version.fileSize,
          scale: version.scale,
          rotationDeg: version.rotationDeg,
          altitudeOffset: version.altitudeOffset,
          positionX: version.positionX,
          positionZ: version.positionZ,
          rotationXDeg: version.rotationXDeg,
          rotationZDeg: version.rotationZDeg,
          enabled: version.publicationStatus === "published" && version.modelEnabled,
          visible: version.modelVisible,
          castShadow: version.castShadow,
          receiveShadow: version.receiveShadow,
          selectable: version.selectable,
          transformLocked: version.transformLocked,
          updatedAt: version.updatedAt,
          unitLinks: version.unitLinks.map((l) => ({
            meshName: l.meshName,
            unitId: l.unitId,
            poiYawDeg: l.poiYawDeg,
            poiEnabled: l.poiEnabled,
            poiDistanceOverride: l.poiDistanceOverride,
            poiHeightOverride: l.poiHeightOverride,
          })),
          sceneManifest: version.sceneManifest ?? [],
          nodeOverrides: version.nodeOverrides ?? [],
          triangleCount: version.triangleCount,
          meshCount: version.meshCount,
          materialCount: version.materialCount,
          textureCount: version.textureCount,
        },
      };
    })
  );
  return NextResponse.json(models.filter((m): m is NonNullable<typeof m> => m !== null));
}
