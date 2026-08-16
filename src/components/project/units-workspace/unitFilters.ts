import type { Unit } from "@/lib/types";

/** Phase 2 was built against a "Studio/1+1/2+1/3+1/4+1" bedroom-count
 * label — real Unit rows only carry a raw `bedrooms: number`, so this is
 * the shared derivation every unit-search surface uses. Originally lived
 * in the (now-removed) mock-data generator; kept here since it's real,
 * presentation-layer logic, not mock-specific. */
export function bedroomLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio" : `${bedrooms}+1`;
}

export type StatusFilter = "available" | "reserved" | "sold" | "all";
export type SortOption = "recommended" | "priceAsc" | "priceDesc" | "areaAsc" | "areaDesc" | "floorAsc" | "floorDesc";

export interface UnitFilterState {
  query: string;
  status: StatusFilter;
  /** Bedroom-count bucket, or null = every type. */
  bedrooms: number | null;
  building: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minFloor: number | null;
  maxFloor: number | null;
  sort: SortOption;
}

export const DEFAULT_UNIT_FILTERS: UnitFilterState = {
  query: "",
  status: "available",
  bedrooms: null,
  building: null,
  minPrice: null,
  maxPrice: null,
  minFloor: null,
  maxFloor: null,
  sort: "recommended",
};

/** How many of `DEFAULT_UNIT_FILTERS`' fields this state actually
 * diverges on — drives the render's own "Clear filters (2)" badge. Status
 * defaulting to "available" (not "all") is itself the PRD's own default,
 * so it's deliberately excluded from the count — clearing filters returns
 * to "Available" being selected, not "All". */
export function activeFilterCount(state: UnitFilterState): number {
  let n = 0;
  if (state.bedrooms != null) n++;
  if (state.building != null) n++;
  if (state.minPrice != null || state.maxPrice != null) n++;
  if (state.minFloor != null || state.maxFloor != null) n++;
  return n;
}

export function filterUnits(units: Unit[], state: UnitFilterState): Unit[] {
  const q = state.query.trim().toLowerCase();
  return units.filter((u) => {
    if (state.status !== "all" && u.status !== state.status) return false;
    if (state.bedrooms != null && u.bedrooms !== state.bedrooms) return false;
    if (state.building != null && u.buildingName !== state.building) return false;
    if (state.minPrice != null && u.price < state.minPrice) return false;
    if (state.maxPrice != null && u.price > state.maxPrice) return false;
    if (state.minFloor != null && u.floor < state.minFloor) return false;
    if (state.maxFloor != null && u.floor > state.maxFloor) return false;
    if (q) {
      const haystack = `${u.code} ${u.buildingName} ${bedroomLabel(u.bedrooms)}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

const STATUS_RANK: Record<Unit["status"], number> = { available: 0, reserved: 1, sold: 2 };

export function sortUnits(units: Unit[], sort: SortOption): Unit[] {
  const sorted = [...units];
  switch (sort) {
    case "priceAsc":
      return sorted.sort((a, b) => a.price - b.price);
    case "priceDesc":
      return sorted.sort((a, b) => b.price - a.price);
    case "areaAsc":
      return sorted.sort((a, b) => a.area - b.area);
    case "areaDesc":
      return sorted.sort((a, b) => b.area - a.area);
    case "floorAsc":
      return sorted.sort((a, b) => a.floor - b.floor);
    case "floorDesc":
      return sorted.sort((a, b) => b.floor - a.floor);
    case "recommended":
    default:
      // Available first, then by floor — a reasonable stand-in for a real
      // "recommended" ranking signal, which doesn't exist on mock data.
      return sorted.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.floor - b.floor);
  }
}
