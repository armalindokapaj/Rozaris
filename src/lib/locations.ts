import { prisma } from "@/lib/db";

/**
 * Canonical Location System helpers — see MEMORY note
 * "rozaris-controlled-taxonomy-spec" and the schema-header comment above
 * `Location` in prisma/schema.prisma. First real consumer: `POST
 * /api/listings`, which used to validate a submitted neighborhood id
 * against the in-memory `mockData.neighborhoods` array only — this
 * resolves it against the real `locations` table instead, walking the
 * parent chain up to the nearest `city` ancestor for the (still-present,
 * legacy) `Listing.city` string column.
 */

/** Resolves a neighborhood-level (or any) Location id to itself plus its
 * nearest `city`-typed ancestor's official name — `null` if the id doesn't
 * exist or has been deactivated. */
export async function resolveLocation(
  locationId: string
): Promise<{ id: string; officialName: string; lat: number | null; lng: number | null; cityName: string } | null> {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || !location.isActive) return null;

  let cityName = location.officialName;
  let cursor = location;
  while (cursor.type !== "city" && cursor.parentId) {
    const parent = await prisma.location.findUnique({ where: { id: cursor.parentId } });
    if (!parent) break;
    cursor = parent;
    if (cursor.type === "city") cityName = cursor.officialName;
  }

  return {
    id: location.id,
    officialName: location.officialName,
    lat: location.latitude,
    lng: location.longitude,
    cityName,
  };
}
