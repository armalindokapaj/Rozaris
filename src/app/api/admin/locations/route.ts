import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logAuditEvent } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { LOCATION_TYPES, ALLOWED_PARENT_TYPES } from "@/lib/locationHierarchy";
import type { LocationType } from "@/generated/prisma";

const VALID_TYPES: LocationType[] = LOCATION_TYPES;

/**
 * Admin write surface for the Canonical Location System (see MEMORY note
 * "rozaris-controlled-taxonomy-spec" and the schema-header comment above
 * `Location` in prisma/schema.prisma). `GET /api/locations` (public) reads
 * this same table for every dropdown that assigns a location to a
 * Listing/Project; until now nothing could add or rename a row in it —
 * the whole tree came from one seed script
 * (`scripts/seed-locations.ts`), run once by hand. This is what lets an
 * admin add a missing neighborhood (or fix a misspelled one) without a new
 * deploy.
 *
 * GET returns the full tree (every type, active or not — admin needs to
 * see and reactivate a deactivated row, unlike the public route which only
 * ever lists active ones) with each row's dependent counts, so the admin
 * UI can grey out "Delete" on anything still in use instead of letting a
 * delete silently orphan real Listings/Projects.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const locations = await prisma.location.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { officialName: "asc" }],
    include: {
      _count: { select: { children: true, properties: true, projects: true } },
    },
  });

  return NextResponse.json(
    locations.map((l) => ({
      id: l.id,
      parentId: l.parentId,
      type: l.type,
      officialName: l.officialName,
      slug: l.slug,
      latitude: l.latitude,
      longitude: l.longitude,
      isActive: l.isActive,
      sortOrder: l.sortOrder,
      childCount: l._count.children,
      propertyCount: l._count.properties,
      projectCount: l._count.projects,
      // Not the full geometry itself (this list feeds the table + every
      // parent-picker dropdown — a boundary can be hundreds of coordinate
      // pairs, no reason to ship that on every row just to render a name).
      // `LocationBoundaryEditor` fetches one full row's real
      // `boundaryGeometry` via `GET /api/admin/locations/[id]` only once
      // it's the one actually selected for editing.
      hasBoundary: l.boundaryGeometry != null,
    }))
  );
}

const createSchema = z.object({
  type: z.enum(VALID_TYPES as [LocationType, ...LocationType[]]),
  officialName: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sortOrder: z.number().int().optional().default(0),
});

/**
 * Adds one new row to the tree — an admin typing in a neighborhood/city
 * the seed script never covered, rather than a raw DB edit. `id`/`slug` are
 * both derived from `officialName` (same auto-dedupe-with-a-numeric-suffix
 * pattern `POST /api/listings`/`POST /api/projects` already use for their
 * own slugs) — nothing about the Canonical Location System asks an admin
 * to hand-type an id, and every existing consumer (`resolveLocation`,
 * `useLocations`) only ever reads `officialName`/`id` back, never expects
 * a particular id shape.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { type, officialName, parentId, latitude, longitude, sortOrder } = parsed.data;

  // Real hierarchy enforcement (2026-08-21 spec) — Municipality must be
  // top-level; every other type must have a parent, and it must be one of
  // the types that location type is actually allowed to sit under (a
  // Village under a City, or a Neighbourhood under another Neighbourhood,
  // are exactly the mismatches this rejects).
  const allowedParentTypes = ALLOWED_PARENT_TYPES[type];
  if (allowedParentTypes.length === 0) {
    if (parentId) {
      return NextResponse.json({ error: `A "${type}" location must be top-level (no parent).` }, { status: 400 });
    }
  } else if (!parentId) {
    return NextResponse.json({ error: `A parent is required for a "${type}" location.` }, { status: 400 });
  } else {
    const parent = await prisma.location.findUnique({ where: { id: parentId }, select: { id: true, type: true } });
    if (!parent) {
      return NextResponse.json({ error: `Unknown parent location "${parentId}".` }, { status: 400 });
    }
    if (!allowedParentTypes.includes(parent.type)) {
      return NextResponse.json(
        { error: `A "${type}" location's parent must be a ${allowedParentTypes.join(" or ")} — "${parentId}" is a ${parent.type}.` },
        { status: 400 }
      );
    }
  }

  const base = slugify(officialName);
  let slug = base;
  let id = base;
  let suffix = 2;
  // Both `slug` and `id` carry independent uniqueness — check each and
  // widen the shared suffix until neither collides, rather than juggling
  // two separate loops.
  while (
    (await prisma.location.findUnique({ where: { slug }, select: { id: true } })) ||
    (await prisma.location.findUnique({ where: { id }, select: { id: true } }))
  ) {
    slug = `${base}-${suffix}`;
    id = `${base}-${suffix}`;
    suffix++;
  }

  const location = await prisma.location.create({
    data: {
      id,
      slug,
      type,
      officialName: officialName.trim(),
      parentId: parentId ?? null,
      latitude,
      longitude,
      sortOrder,
    },
  });

  await logAuditEvent({
    actor: gate.user?.email ?? gate.user?.name ?? "admin",
    actorId: gate.user?.id,
    action: `Location created: "${location.officialName}" (${location.type})`,
    entityType: "Location",
    entityId: location.id,
    entityLabel: location.officialName,
    newState: location,
  });

  return NextResponse.json(location);
}
