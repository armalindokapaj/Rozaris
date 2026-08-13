import type { Unit } from "./types";

/** Raw shape `GET /api/projects/[projectId]/units` returns — the Prisma
 * `Unit` row's JSON shape, not the app's `Unit` type. `type`/`currency`/
 * `transaction`/`status` are unconstrained `String` columns in Postgres
 * (no DB enum), unlike the closed unions `Unit` declares for them;
 * `floorPlanImage`/`facadeImage`/`videoUrl` are nullable columns where
 * `Unit` has a required string / optional-undefined field respectively;
 * `deletedAt`/`deletedBy`/`projectId` are real columns (soft-delete
 * bookkeeping + explicit FK) `Unit` doesn't model at all. */
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
}

/** Normalizes one Postgres `units` row into the app's `Unit` type — the
 * one seam between Prisma's shape and every Configurator surface that
 * already assumes mockData's shape (RenderEngine's per-status color
 * lookup, threeBuilding's procedural layout, UnitsPanel). `type`/
 * `currency`/`transaction`/`status` are narrowed with a cast rather than
 * validated at runtime — every row that exists today was itself written
 * through this app's own zod-validated `/api/projects/[projectId]/units`
 * routes or `prisma/seed.ts` (whose input, mockData.ts, is already typed
 * `Unit`), so there's no path that writes an out-of-union value yet. The
 * one place that matters if that ever stops being true —
 * RenderEngine.ts's status-color lookup — still defends independently
 * (see its own comment) since a wrong hex there is a visible per-project
 * bug, not a compile error. */
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
  };
}

/** One building/floor's real identity, derived from `Unit.buildingName`/
 * `Unit.floor` — not a foreign key to a real Floor table (none exists).
 * Shared by `BuildingNavRail.tsx` (left rail nav), `UnitsPanel.tsx`'s
 * `selectedFloor` filter, and the Sections module's `Section.floorId`
 * assignment — one real source of floor identity instead of three
 * independent groupings. */
export interface FloorGroup {
  buildingName: string;
  floor: number;
  /** `${buildingName}::${floor}` — the composite id `Section.floorId`
   * stores. */
  floorId: string;
  units: Unit[];
}

export interface BuildingGroup {
  name: string;
  /** Sorted floor descending (top floor/roof first), matching the
   * reference mockup's building/floor nav. */
  floors: FloorGroup[];
}

export function makeFloorId(buildingName: string, floor: number): string {
  return `${buildingName}::${floor}`;
}

/** Groups real units by building, then by floor — the one place this
 * grouping happens; every consumer (left rail, Inventory's floor filter,
 * Sections' floor-assignment dropdown) reuses this instead of re-deriving
 * it independently. */
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
