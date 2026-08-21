import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { resolveLocation } from "@/lib/locations";

const bodySchema = z.object({ neighborhoodId: z.string().min(1) });

/**
 * Locations tab's "Fix" action for a Project whose location doesn't
 * resolve (see `GET /api/admin/locations/issues`) — a lightweight,
 * location-only sibling of `POST /api/projects` (the full edit-project
 * save, which requires every other project field too and is overkill for
 * "just point this at the right neighborhood"). Reuses that same route's
 * cascade: every Listing already attached to this project moves with it
 * ("unit location follows project location" — see that route's own doc
 * comment), not just the Project row itself.
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

  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const location = await resolveLocation(parsed.data.neighborhoodId);
  if (!location) {
    return NextResponse.json({ error: `Unknown location "${parsed.data.neighborhoodId}".` }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      neighborhoodId: location.id,
      city: location.cityName,
      locationId: location.id,
      // A resolved centroid always wins here — this action exists purely
      // to fix a bad location, so there's no "confirmed pin" to preserve
      // the way the public listing-submission flow does.
      lat: location.lat ?? existing.lat,
      lng: location.lng ?? existing.lng,
    },
  });

  const affectedListings = await prisma.listing.findMany({
    where: { projectId, deletedAt: null },
    select: { propertyId: true },
  });
  if (affectedListings.length > 0) {
    await prisma.property.updateMany({
      where: { id: { in: affectedListings.map((l) => l.propertyId) } },
      data: {
        neighborhoodId: updated.neighborhoodId,
        city: updated.city,
        locationId: updated.locationId,
        lat: updated.lat,
        lng: updated.lng,
        locationConfirmed: true,
      },
    });
  }

  revalidatePath(`/project/${updated.slug}`);
  revalidatePath(`/projects/${updated.slug}`);
  revalidatePath("/new-projects");

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action: `Project location fixed → "${location.officialName}"`,
    entityType: "Project",
    entityId: projectId,
    entityLabel: updated.name,
    previousState: existing,
    newState: updated,
  });

  return NextResponse.json(updated);
}
