import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LOCATION_TYPES } from "@/lib/locationHierarchy";
import type { LocationType } from "@/generated/prisma";

const VALID_TYPES: LocationType[] = LOCATION_TYPES;

/**
 * Canonical Location System — public read endpoint (see MEMORY note
 * "rozaris-controlled-taxonomy-spec" and the schema-header comment above
 * `Location` in prisma/schema.prisma). First real consumer: the
 * publisher/admin location dropdowns (NewListingForm, NewProjectModal,
 * EditProjectModal) that used to read the fixed `mockData.neighborhoods`
 * array — the actual write-side validation (`POST /api/listings`) already
 * moved onto this table; this is what lets the UI offer the same real set
 * instead of a hardcoded one that can drift from it.
 *
 * `?type=neighborhood` filters to one level of the hierarchy;
 * `?type=neighborhood,village` (comma-separated) offers more than one —
 * every "pick this listing's exact location" dropdown wants both, since a
 * unit can sit directly in a Village with no neighborhood layer at all
 * (2026-08-21 spec). Each row's `cityName` is its nearest `city`-typed
 * ancestor's official name, resolved server-side so the client never has
 * to walk the parent chain itself — falls back to the row's own
 * `officialName` when it has no `city` ancestor at all (e.g. a
 * neighborhood/village sitting directly under a Municipality with no
 * distinct city center, like Himarë/Dhërmi).
 */
export async function GET(request: Request) {
  const typeParam = new URL(request.url).searchParams.get("type");
  const requestedTypes = typeParam?.split(",").map((t) => t.trim()).filter(Boolean);
  const types = requestedTypes?.map((rt) => VALID_TYPES.find((t) => t === rt));
  if (requestedTypes && types?.some((t) => !t)) {
    return NextResponse.json({ error: `Invalid type in "${typeParam}".` }, { status: 400 });
  }

  const locations = await prisma.location.findMany({
    where: {
      isActive: true,
      ...(types ? { type: { in: types as LocationType[] } } : {}),
    },
    // Unrolls 2 levels deep — plenty for this hierarchy's max real depth
    // (Municipality -> City -> Neighborhood is only 2 hops up from a leaf
    // neighborhood row).
    include: { parent: { include: { parent: true } } },
    orderBy: [{ sortOrder: "asc" }, { officialName: "asc" }],
  });

  const result = locations.map((location) => {
    let cityName = location.officialName;
    if (location.type !== "city") {
      const ancestors = [location.parent, location.parent?.parent];
      const cityAncestor = ancestors.find((a) => a?.type === "city");
      if (cityAncestor) cityName = cityAncestor.officialName;
    }
    return {
      id: location.id,
      type: location.type,
      officialName: location.officialName,
      slug: location.slug,
      latitude: location.latitude,
      longitude: location.longitude,
      cityName,
    };
  });

  return NextResponse.json(result);
}
