import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

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
