import { prisma } from "@/lib/db";

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
