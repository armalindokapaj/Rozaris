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
    force: z.boolean().optional(),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), {
    message: "lat and lng must be sent together.",
  })
  .refine((v) => v.neighborhoodId != null || v.lat != null || v.force, {
    message: "Send a neighborhoodId, a lat/lng pin, or force.",
  });

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
