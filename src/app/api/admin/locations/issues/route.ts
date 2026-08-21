import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * "Fix the listings and units if they have a problem" — real, on-demand
 * scan (same style as `GET /api/admin/integrity-check`) for `Listing`/
 * `Project` rows whose location doesn't resolve to a real, active
 * `Location` right now. A `Unit` has no location field of its own (it
 * always inherits its Project's — see the schema-header note on
 * `Listing.unitId`), so a "broken unit location" is really its Project's
 * location; nothing extra to scan there.
 *
 * How a row ends up here despite every write path resolving against
 * `Location` at write time (`POST /api/listings`, `POST /api/projects`):
 * an admin later deactivated or deleted the `Location` that row still
 * points at (deactivate deliberately doesn't cascade — see the `[locationId]`
 * route's own doc comment), or the row predates the Canonical Location
 * System (a raw import, or written before `neighborhoodId` validation
 * existed).
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [activeLocationIds, listings, projects] = await Promise.all([
    prisma.location
      .findMany({ where: { isActive: true }, select: { id: true } })
      .then((rows) => new Set(rows.map((r) => r.id))),
    prisma.listing.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        projectId: true,
        project: { select: { name: true } },
        publisher: { select: { name: true } },
        property: { select: { neighborhoodId: true, city: true } },
      },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        neighborhoodId: true,
        city: true,
        publisher: { select: { name: true } },
      },
    }),
  ]);

  const brokenListings = listings
    .filter((l) => !l.property.neighborhoodId || !activeLocationIds.has(l.property.neighborhoodId))
    .map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      publisherName: l.publisher.name,
      projectId: l.projectId,
      projectName: l.project?.name ?? null,
      neighborhoodId: l.property.neighborhoodId,
      city: l.property.city,
    }));

  const brokenProjects = projects
    .filter((p) => !p.neighborhoodId || !activeLocationIds.has(p.neighborhoodId))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      publisherName: p.publisher.name,
      neighborhoodId: p.neighborhoodId,
      city: p.city,
    }));

  return NextResponse.json({ listings: brokenListings, projects: brokenProjects });
}
