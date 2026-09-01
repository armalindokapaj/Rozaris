import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { MapModelVersion } from "@/generated/prisma";

function toLegacyShape(v: MapModelVersion) {
  return {
    projectId: v.projectId,
    glbUrl: v.publicAssetUrl,
    fileName: v.fileName,
    fileSize: v.fileSize,
    scale: v.scale,
    rotationDeg: v.heading,
    altitudeOffset: v.altitude,
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
