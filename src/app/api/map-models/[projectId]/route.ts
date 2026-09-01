import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function toLegacyShape(v: {
  projectId: string;
  publicAssetUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  scale: number;
  heading: number;
  altitude: number;
  longitude: number;
  latitude: number;
  publicationStatus: string;
  hideBaseBuilding: boolean;
  hiddenBuildings: unknown;
  updatedAt: Date;
}) {
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const version = await prisma.mapModelVersion.findFirst({
    where: { projectId, publicationStatus: "published", deletedAt: null },
  });
  return NextResponse.json(version ? toLegacyShape(version) : null);
}
