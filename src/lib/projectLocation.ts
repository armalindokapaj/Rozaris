import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { resolveLocation } from "@/lib/locations";

export interface ProjectLocationSyncCounts {
  listings: number;
  mapModelVersions: number;
  mapViewReset: boolean;
}

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

export async function setProjectLocation(input: {
  projectId: string;
  neighborhoodId?: string;
  lat?: number;
  lng?: number;
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

  const synced =
    changed || input.force
      ? await syncProjectLocationDependents(project)
      : { listings: 0, mapModelVersions: 0, mapViewReset: false };

  if (changed || input.force) revalidateProjectLocation(project.slug);

  return { ok: true, project, previous: existing, synced, locationName, changed };
}

function revalidateProjectLocation(slug: string) {
  revalidatePath(`/project/${slug}`);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/new-projects");
}
