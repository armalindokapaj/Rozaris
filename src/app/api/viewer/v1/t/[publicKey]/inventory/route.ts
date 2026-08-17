import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublishTarget } from "@/lib/viewer/resolveTarget";
import { toPublicUnitDto } from "@/lib/viewer/inventoryDto";

/**
 * Multi-Channel Publishing PRD Phase 6, §16-17 "Live inventory endpoint" +
 * "Inventory caching". `ETag`/`If-None-Match` keyed on
 * `ProjectInventoryState.revision` — see inventoryRevision.ts's doc
 * comment for where that counter actually gets bumped. Cheap: a viewer
 * polling this every 15-30s (PRD §19) gets a 304 with no body on every
 * request until an admin/connector write actually changes something.
 */
export async function GET(request: Request, { params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  const resolution = await resolvePublishTarget(publicKey, request);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: resolution.status });
  }
  const { target } = resolution;

  const inventoryState = await prisma.projectInventoryState.findUnique({
    where: { projectId: target.projectId },
    select: { revision: true },
  });
  const revision = inventoryState?.revision ?? BigInt(0);
  const etag = `"inventory-${revision.toString()}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const [units, overrides] = await Promise.all([
    prisma.unit.findMany({ where: { projectId: target.projectId, deletedAt: null } }),
    prisma.publishTargetUnitOverride.findMany({ where: { publishTargetId: target.id } }),
  ]);
  const overrideByUnitId = new Map(overrides.map((o) => [o.unitId, o]));

  const dto = units
    .map((unit) => toPublicUnitDto(unit, overrideByUnitId.get(unit.id)))
    .filter((u): u is NonNullable<typeof u> => u !== null);

  return NextResponse.json(
    { revision: revision.toString(), units: dto },
    { headers: { ETag: etag, "Cache-Control": "private, no-cache" } }
  );
}
