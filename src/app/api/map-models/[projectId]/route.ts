import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET-only as of the Platform Audit (finding C2) — resolves the project's
 * currently-*published* `MapModelVersion` instead of the old single-row
 * `ProjectMapModel`, keeping the exact same response shape for
 * MapModelEditor.tsx and every other existing caller. This route used to
 * also expose unauthenticated PUT/DELETE against the legacy table; both
 * were removed outright rather than gated, since the versioned pipeline
 * (POST/PATCH .../versions, requireAdmin()-gated) already fully replaced
 * them and nothing in the frontend called them anymore.
 */
function toLegacyShape(v: {
  projectId: string;
  publicAssetUrl: string;
  fileName: string;
  fileSize: number;
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

// PUT/DELETE removed (Platform Audit, see the "rozaris-publish-security-
// audit" memory, finding C2) — they wrote the legacy single-row
// `ProjectMapModel` table with NO auth check at all, and nothing in the
// frontend has called them since the versioned pipeline
// (POST/PATCH .../versions, requireAdmin()-gated) replaced them. Confirmed
// via a full grep sweep: every remaining caller of this route only ever
// does a bare (GET) `fetch()`. Use the versioned routes for any new write.
