import { prisma } from "@/lib/db";
import { normalizeListing } from "@/lib/listings";
import { getAllProjects } from "@/lib/projects.server";
import { projectUnitListingsFrom } from "@/lib/projects";
import type { Listing } from "@/lib/types";

export async function getListingDetail(
  slug: string
): Promise<{ listing: Listing; related: Listing[] } | null> {
  const [row, projectUnitListings] = await Promise.all([
    prisma.listing.findFirst({
      where: { slug, deletedAt: null },
      include: { publisher: true, property: true },
    }),
    getAllProjects().then(projectUnitListingsFrom),
  ]);
  const listing: Listing | undefined =
    (row && normalizeListing(row)) ?? projectUnitListings.find((l) => l.slug === slug);

  if (!listing) return null;

  const liveNeighbors = await prisma.listing.findMany({
    where: {
      property: { neighborhoodId: listing.neighborhoodId },
      status: "active",
      deletedAt: null,
      id: { not: listing.id },
    },
    include: { publisher: true, property: true },
    take: 4,
    orderBy: { createdAt: "desc" },
  });
  const liveUnitNeighbors = projectUnitListings.filter(
    (l) => l.neighborhoodId === listing.neighborhoodId && l.id !== listing.id
  );
  const related = [...liveNeighbors.map(normalizeListing), ...liveUnitNeighbors].slice(0, 4);

  return { listing, related };
}

export async function getAllListingSlugs(): Promise<string[]> {
  const [rows, projects] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "active", deletedAt: null },
      select: { slug: true },
    }),
    getAllProjects(),
  ]);
  return [...rows.map((r) => r.slug), ...projectUnitListingsFrom(projects).map((l) => l.slug)];
}

export async function getActiveListingsByPublisher(publisherId: string): Promise<Listing[]> {
  const rows = await prisma.listing.findMany({
    where: { publisherId, status: "active", deletedAt: null },
    include: { publisher: true, property: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(normalizeListing);
}
