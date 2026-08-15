import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { LocationType } from "@/generated/prisma";

const VALID_TYPES: LocationType[] = [
  "country",
  "county",
  "municipality",
  "city",
  "administrative_unit",
  "neighborhood",
];

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
 * `?type=neighborhood` (etc.) filters to one level of the hierarchy —
 * every existing dropdown only ever needs neighborhoods today, since Tirana
 * is still the only city with any real inventory. Each row's `cityName` is
 * its nearest `city`-typed ancestor's official name, resolved server-side
 * so the client never has to walk the parent chain itself.
 */
export async function GET(request: Request) {
  const typeParam = new URL(request.url).searchParams.get("type");
  const type = VALID_TYPES.find((t) => t === typeParam);
  if (typeParam && !type) {
    return NextResponse.json({ error: `Invalid type "${typeParam}".` }, { status: 400 });
  }

  const locations = await prisma.location.findMany({
    where: {
      isActive: true,
      ...(type ? { type } : {}),
    },
    include: { parent: { include: { parent: { include: { parent: true } } } } },
    orderBy: [{ sortOrder: "asc" }, { officialName: "asc" }],
  });

  const result = locations.map((location) => {
    let cityName = location.officialName;
    if (location.type !== "city") {
      // Nested `include` only unrolls 3 levels deep (plenty for the
      // Country->County->Municipality->City->Neighborhood shape this
      // seeds) — walk the ancestors that came back looking for the
      // nearest `city`-typed one.
      const ancestors = [location.parent, location.parent?.parent, location.parent?.parent?.parent];
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
