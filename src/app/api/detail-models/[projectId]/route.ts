import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET-only as of the Platform Audit (finding C2). Name is legacy (predates
 * the Multiple Detail-Model Slots pass) but the response resolves EVERY one
 * of the project's slots' currently-*published* `DetailModelVersion` (see
 * ./slots/[slotId]/versions/route.ts for the full per-slot history/draft/
 * publish/rollback/carry-forward pipeline) instead of a single row —
 * a project can have several independently-published slots ("Building",
 * "Surroundings", ...) rendering simultaneously. Each array entry keeps
 * the exact same per-model shape the old single-object response had
 * (`glbUrl/fileName/.../enabled/unitLinks: {meshName,unitId}[]`), just
 * wrapped with `slotId`/`slotName` and returned as a list —
 * `useProjectDetailModel.ts` and its 2 call sites updated together. This
 * route used to also expose unauthenticated PUT/DELETE against the legacy
 * `ProjectDetailModel` table, and a sibling ./links/route.ts exposed an
 * unauthenticated PUT against `UnitMeshLink` — all three were removed
 * outright (not gated): the versioned/slots pipeline (requireAdmin()-gated)
 * already fully replaced them and nothing in the frontend called them.
 */
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
        model: {
          glbUrl: version.publicAssetUrl,
          fileName: version.fileName,
          fileSize: version.fileSize,
          scale: version.scale,
          rotationDeg: version.rotationDeg,
          altitudeOffset: version.altitudeOffset,
          // Experience Editor v2, Scene tab (PRD §5) fields — a real bug
          // this fixes: these were added to ProjectDetailModel/the DB
          // schema in Phase 1 but this route (the PUBLIC-facing one,
          // unlike the admin editor's own .../slots/.../versions route)
          // was never updated to include them, so the public viewer's
          // RenderEngine received `undefined` for positionX/positionZ —
          // THREE.Vector3.set(undefined, ..., undefined) silently
          // produces NaN, rendering the model invisible with no error.
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
          unitLinks: version.unitLinks.map((l) => ({ meshName: l.meshName, unitId: l.unitId })),
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

// PUT/DELETE removed (Platform Audit, see the "rozaris-publish-security-
// audit" memory, finding C2) — they wrote the legacy single-row
// `ProjectDetailModel` table with NO auth check at all, and nothing in the
// frontend has called them since the versioned/slots pipeline
// (requireAdmin()-gated) replaced them. Confirmed via a full grep sweep:
// every remaining caller of this route only ever does a bare (GET)
// `fetch()`. Use the versioned routes for any new write.
