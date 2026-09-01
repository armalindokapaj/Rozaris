import { UNIT_ORIENTATIONS, type Unit, type UnitOrientation } from "./types";

export interface RawUnitRow {
  id: string;
  code: string;
  type: string;
  buildingName: string;
  floor: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  price: number;
  currency: string;
  transaction: string;
  status: string;
  images: string[];
  floorPlanImage: string | null;
  facadeImage: string | null;
  videoUrl: string | null;
  orientation: string | null;
}

export function normalizeUnit(row: RawUnitRow): Unit {
  return {
    id: row.id,
    code: row.code,
    type: row.type as Unit["type"],
    buildingName: row.buildingName,
    floor: row.floor,
    area: row.area,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    price: row.price,
    currency: row.currency as Unit["currency"],
    transaction: row.transaction as Unit["transaction"],
    status: row.status as Unit["status"],
    images: row.images,
    floorPlanImage: row.floorPlanImage ?? "",
    facadeImage: row.facadeImage ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
    orientation: parseUnitOrientation(row.orientation),
  };
}

export function parseUnitOrientation(value: string | null | undefined): UnitOrientation | undefined {
  return UNIT_ORIENTATIONS.includes(value as UnitOrientation) ? (value as UnitOrientation) : undefined;
}

export interface FloorGroup {
  buildingName: string;
  floor: number;
  floorId: string;
  units: Unit[];
}

export interface BuildingGroup {
  name: string;
  floors: FloorGroup[];
}

export function makeFloorId(buildingName: string, floor: number): string {
  return `${buildingName}::${floor}`;
}

export function groupUnitsByFloor(units: Unit[]): BuildingGroup[] {
  const byBuilding = new Map<string, Map<number, Unit[]>>();
  for (const u of units) {
    if (!byBuilding.has(u.buildingName)) byBuilding.set(u.buildingName, new Map());
    const byFloor = byBuilding.get(u.buildingName)!;
    if (!byFloor.has(u.floor)) byFloor.set(u.floor, []);
    byFloor.get(u.floor)!.push(u);
  }
  return Array.from(byBuilding.entries())
    .map(([name, byFloor]) => ({
      name,
      floors: Array.from(byFloor.entries())
        .map(([floor, floorUnits]): FloorGroup => ({
          buildingName: name,
          floor,
          floorId: makeFloorId(name, floor),
          units: floorUnits,
        }))
        .sort((a, b) => b.floor - a.floor),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function unitStatusForListingStatus(listingStatus: string): Unit["status"] | null {
  switch (listingStatus) {
    case "active":
      return "available";
    case "sold":
    case "rented":
      return "sold";
    default:
      return null;
  }
}
