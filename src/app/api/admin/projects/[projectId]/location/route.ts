import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { setProjectLocation } from "@/lib/projectLocation";

const bodySchema = z
  .object({
    neighborhoodId: z.string().min(1).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    /** "Re-anchor everything to this record" — see `setProjectLocation`'s
     * own `force` doc comment. */
    force: z.boolean().optional(),
  })
  // A pin is two numbers or neither — half a coordinate would silently
  // move the project along one axis only.
  .refine((v) => (v.lat == null) === (v.lng == null), {
    message: "lat and lng must be sent together.",
  })
  .refine((v) => v.neighborhoodId != null || v.lat != null || v.force, {
    message: "Send a neighborhoodId, a lat/lng pin, or force.",
  });

/**
 * The one endpoint that moves a project — the canonical location write
 * path (`src/lib/projectLocation.ts`), used by:
 *
 *  - the 3D Map Control's pin (`MapModelEditor`, both the standalone
 *    `/admin/3d-map-control/[projectId]` page and the Project Manager's
 *    own "3D Map Control" section), which drags the project's real site
 *    coordinates rather than a model offset of its own;
 *  - the Locations tab's "Fix" action for a Project whose location doesn't
 *    resolve (see `GET /api/admin/locations/issues`), which sends only a
 *    `neighborhoodId`.
 *
 * A lightweight sibling of `POST /api/projects` (the full record save,
 * which requires every other project field too and is overkill for "just
 * move this pin"), sharing that route's cascade: the units' listings,
 * every map-model version and the 3D Experience map anchor all move with
 * the project, so there is exactly one location for the development, not
 * one per surface.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { projectId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await setProjectLocation({ projectId, ...parsed.data });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { project, previous, synced, locationName, changed } = result;
  // A save that moved nothing writes no audit entry — the Map Control's
  // Save button is pressable whether or not the pin actually moved, and a
  // trail full of "re-anchored (0 versions, 0 listings)" rows makes the
  // real moves harder to find.
  const touchedSomething =
    changed || synced.listings > 0 || synced.mapModelVersions > 0 || synced.mapViewReset;
  if (touchedSomething) {
    await logAuditEvent({
      actor: gate.user?.email ?? gate.user?.name ?? "admin",
      actorId: gate.user?.id,
      action: locationName
        ? `Project location set → "${locationName}"`
        : changed
        ? `Project pin moved → ${project.lat.toFixed(6)}, ${project.lng.toFixed(6)}`
        : `Project location re-anchored (${synced.mapModelVersions} map-model version(s), ${synced.listings} listing(s))`,
      entityType: "Project",
      entityId: projectId,
      entityLabel: project.name,
      previousState: previous ?? undefined,
      newState: project,
    });
  }

  return NextResponse.json({ ...project, changed, synced });
}
