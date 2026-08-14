import { prisma } from "@/lib/db";
import { normalizeListing } from "@/lib/listings";
import { projectUnitListings } from "@/lib/mockData";
import type { Listing } from "@/lib/types";

/**
 * Server-only listing detail lookup, shared by `/listing/[slug]/page.tsx`
 * (a server component — calls this directly, the standard Next.js
 * App Router pattern, rather than self-fetching its own API route over
 * HTTP) and `GET /api/listings/slug/[slug]` (for any client-side caller).
 * Only import this from server contexts — it pulls in `@/lib/db` (Prisma),
 * which must never reach the browser bundle.
 */
export async function getListingDetail(
  slug: string
): Promise<{ listing: Listing; related: Listing[] } | null> {
  const row = await prisma.listing.findFirst({
    where: { slug, deletedAt: null },
    include: { publisher: true },
  });
  const listing: Listing | undefined =
    (row && normalizeListing(row)) ?? projectUnitListings.find((l) => l.slug === slug);

  if (!listing) return null;

  const liveNeighbors = await prisma.listing.findMany({
    where: {
      neighborhoodId: listing.neighborhoodId,
      status: "active",
      deletedAt: null,
      id: { not: listing.id },
    },
    include: { publisher: true },
    take: 4,
    orderBy: { createdAt: "desc" },
  });
  const mockNeighbors = projectUnitListings.filter(
    (l) => l.neighborhoodId === listing.neighborhoodId && l.id !== listing.id
  );
  const related = [...liveNeighbors.map(normalizeListing), ...mockNeighbors].slice(0, 4);

  return { listing, related };
}

/** Every slug worth pre-rendering at build time — real listings plus the
 * still-mock project-unit listings. Live listings created after a
 * deployment simply aren't in this list; `dynamicParams` (Next's default,
 * unchanged here) renders those on demand instead of 404ing. */
export async function getAllListingSlugs(): Promise<string[]> {
  const rows = await prisma.listing.findMany({
    where: { status: "active", deletedAt: null },
    select: { slug: true },
  });
  return [...rows.map((r) => r.slug), ...projectUnitListings.map((l) => l.slug)];
}
