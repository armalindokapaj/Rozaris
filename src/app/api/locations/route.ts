import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { LOCATION_TYPES } from "@/lib/locationHierarchy";
import type { LocationType } from "@/generated/prisma";

const VALID_TYPES: LocationType[] = LOCATION_TYPES;

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
