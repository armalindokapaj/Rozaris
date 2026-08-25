import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { resolveLocation } from "@/lib/locations";

/**
 * ONE location per project, and one write path to it.
 *
 * A development's site coordinates used to be authored in three
 * independent places that could — and did — drift apart:
 *
 *   1. `Project.lat/lng` (the record, the search-map pin, every listing
 *      created under the project),
 *   2. `MapModelVersion.latitude/longitude` (the 3D Map Control's model
 *      placement, draggable to anywhere on the map),
 *   3. `Project3DConfig.mapViewLatitude/mapViewLongitude` (the 3D
 *      Experience editor's "Map" tab anchor).
 *
 * Nothing reconciled them, so the pin on the search map, the building on
 * the 3D map and the address on a unit's listing could each point at a
 * different spot. This module makes (1) canonical and (2)/(3) derived:
 * every location write goes through `setProjectLocation`, which moves the
 * project, its units' listings, every map-model version and the 3D
 * Experience map anchor together.
 *
 * Callers: `POST /api/projects` (the Project Manager's record save),
 * `PATCH /api/admin/projects/[projectId]/location` (the 3D Map Control's
 * pin, and the Locations tab's "Fix" action).
 */

export interface ProjectLocationSyncCounts {
  /** Listings whose `Property` row moved with the project — "unit location
   * follows project location" (see `POST /api/listings`' own doc comment
   * for the same rule at creation time). */
  listings: number;
  /** Map-model versions re-anchored. Deliberately includes PUBLISHED and
   * archived rows: a published version is immutable as *content* (its GLB,
   * scale, heading — see the versions PATCH route's 409), but its
   * coordinates are not content, they are the project's one location. A
   * published model left behind at the old spot is exactly the drift this
   * module exists to remove. */
  mapModelVersions: number;
  /** True when the 3D Experience's Map tab had its own hard-coded anchor
   * and was reset to follow the project again (null = "use the project's
   * coordinates" — see Project3DConfig.mapViewLatitude's doc comment). */
  mapViewReset: boolean;
}

/**
 * Pushes an already-updated project row's location out to everything that
 * derives from it. Split out from `setProjectLocation` because
 * `POST /api/projects` upserts the whole record itself (name, media,
 * features and location in one write) and only needs this half.
 *
 * Safe to call unconditionally, but callers should gate on an actual
 * location change — a rename or a hero-image swap must not rewrite every
 * listing's Property row.
 */
export async function syncProjectLocationDependents(project: {
  id: string;
  neighborhoodId: string;
  city: string;
  locationId: string | null;
  lat: number;
  lng: number;
}): Promise<ProjectLocationSyncCounts> {
  const affectedListings = await prisma.listing.findMany({
    where: { projectId: project.id, deletedAt: null },
    select: { propertyId: true },
  });
  if (affectedListings.length > 0) {
    await prisma.property.updateMany({
      where: { id: { in: affectedListings.map((l) => l.propertyId) } },
      data: {
        neighborhoodId: project.neighborhoodId,
        city: project.city,
        locationId: project.locationId,
        lat: project.lat,
        lng: project.lng,
        locationConfirmed: true,
      },
    });
  }

  const movedVersions = await prisma.mapModelVersion.updateMany({
    where: {
      projectId: project.id,
      deletedAt: null,
      OR: [{ latitude: { not: project.lat } }, { longitude: { not: project.lng } }],
    },
    data: { latitude: project.lat, longitude: project.lng },
  });

  const resetMapView = await prisma.project3DConfig.updateMany({
    where: {
      projectId: project.id,
      OR: [{ mapViewLatitude: { not: null } }, { mapViewLongitude: { not: null } }],
    },
    data: { mapViewLatitude: null, mapViewLongitude: null },
  });

  return {
    listings: affectedListings.length,
    mapModelVersions: movedVersions.count,
    mapViewReset: resetMapView.count > 0,
  };
}

export type SetProjectLocationResult =
  | { ok: false; status: 404 | 400; error: string }
  | {
      ok: true;
      project: Awaited<ReturnType<typeof prisma.project.update>>;
      previous: Awaited<ReturnType<typeof prisma.project.findUnique>>;
      synced: ProjectLocationSyncCounts;
      locationName: string | null;
      changed: boolean;
    };

/**
 * The canonical "move this project" action: any subset of
 * `{ neighborhoodId, lat, lng }`, applied to the project row and then
 * cascaded through `syncProjectLocationDependents`.
 *
 * `neighborhoodId` alone re-derives `city`/`locationId` and — only when no
 * explicit pin is supplied — snaps the coordinates to the new location's
 * centroid, which is what the Locations tab's "Fix a broken location"
 * action wants. Supplying `lat`/`lng` always wins over the centroid: the
 * 3D Map Control's pin is a deliberate placement on a real building, not
 * the middle of a neighbourhood.
 *
 * Deliberately does NOT log the audit event — the two callers already
 * write their own, with their own wording, and a second generic entry per
 * save would just be noise in the trail.
 */
export async function setProjectLocation(input: {
  projectId: string;
  neighborhoodId?: string;
  lat?: number;
  lng?: number;
  /** Re-run the cascade even when the project row itself doesn't move.
   * The explicit "pull everything back onto the record's pin" action for
   * a project that predates this module and still has a map-model version
   * or 3D Experience anchor sitting somewhere else. Off by default: a
   * no-op save must not quietly drag a deliberately-placed model, which
   * is exactly how the split gets resolved in the wrong direction. */
  force?: boolean;
}): Promise<SetProjectLocationResult> {
  const existing = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!existing || existing.deletedAt) {
    return { ok: false, status: 404, error: "Project not found." };
  }

  let locationName: string | null = null;
  const data: { neighborhoodId?: string; city?: string; locationId?: string; lat?: number; lng?: number } = {};

  if (input.neighborhoodId && input.neighborhoodId !== existing.neighborhoodId) {
    const location = await resolveLocation(input.neighborhoodId);
    if (!location) {
      return { ok: false, status: 400, error: `Unknown location "${input.neighborhoodId}".` };
    }
    locationName = location.officialName;
    data.neighborhoodId = location.id;
    data.city = location.cityName;
    data.locationId = location.id;
    // Only when the caller didn't place a real pin — see the doc comment.
    if (input.lat == null && input.lng == null && location.lat != null && location.lng != null) {
      data.lat = location.lat;
      data.lng = location.lng;
    }
  }
  if (input.lat != null) data.lat = input.lat;
  if (input.lng != null) data.lng = input.lng;

  const changed =
    (data.neighborhoodId != null && data.neighborhoodId !== existing.neighborhoodId) ||
    (data.lat != null && data.lat !== existing.lat) ||
    (data.lng != null && data.lng !== existing.lng);

  const project = changed
    ? await prisma.project.update({ where: { id: input.projectId }, data })
    : existing;

  // Gated on a real move (or an explicit `force`) — see that option's own
  // comment.
  const synced =
    changed || input.force
      ? await syncProjectLocationDependents(project)
      : { listings: 0, mapModelVersions: 0, mapViewReset: false };

  if (changed || input.force) revalidateProjectLocation(project.slug);

  return { ok: true, project, previous: existing, synced, locationName, changed };
}

/** Every cached surface that renders a project's location. */
function revalidateProjectLocation(slug: string) {
  revalidatePath(`/project/${slug}`);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/new-projects");
}
