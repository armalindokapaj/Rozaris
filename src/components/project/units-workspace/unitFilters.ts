import type { Unit } from "@/lib/types";

/** Phase 2 was built against a "Studio/1+1/2+1/3+1/4+1" bedroom-count
 * label — real Unit rows only carry a raw `bedrooms: number`, so this is
 * the shared derivation every unit-search surface uses. Originally lived
 * in the (now-removed) mock-data generator; kept here since it's real,
 * presentation-layer logic, not mock-specific. */
export function bedroomLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio" : `${bedrooms}+1`;
}

/** Real, fixed bedroom-count buckets (Studio→4+1) — shared between
 * UnitSearchView's own pill row and UnitsBar's dropdown (2026-08-17,
 * Units Bar redesign) so both surfaces offer the identical set rather than
 * two independently-maintained copies. Not derived from the live `units`
 * array (unlike `bathroomOptions` in UnitsBar) — this is a real-estate
 * category scale, not a data-driven option list, same reasoning
 * UnitSearchView's own doc comment already gives for it. */
export const BEDROOM_OPTIONS = [0, 1, 2, 3, 4];

export type StatusFilter = "available" | "reserved" | "sold" | "all";

/** Status → indicator-dot Tailwind class — real, established colors (moved
 * here from UnitSearchView.tsx, 2026-08-18) so the dock's own Availability
 * pills (UnitsContent.tsx, direct instruction: "Available (Green color)...
 * Reserved (Orange Color)... Sold (red color)") reuse the exact same
 * scheme UnitSearchView's filter pills and per-row status dots already
 * shipped with, instead of a second, independently-drifting copy. */
export const STATUS_DOT: Record<Unit["status"], string> = {
  available: "bg-emerald-400",
  reserved: "bg-amber-400",
  sold: "bg-red-400",
};
export type SortOption = "recommended" | "priceAsc" | "priceDesc" | "areaAsc" | "areaDesc" | "floorAsc" | "floorDesc";

export interface UnitFilterState {
  query: string;
  status: StatusFilter;
  /** Bedroom-count bucket, or null = every type. */
  bedrooms: number | null;
  /** Exact bathroom count, or null = every count. Added alongside `minArea`/
   * `maxArea` for the Units Bar redesign (2026-08-17) — UnitSearchView
   * itself still has no bathrooms control of its own (see its doc
   * comment), but the underlying filter state is real and shared, so
   * UnitsBar's Bathrooms dropdown genuinely narrows the same list. */
  bathrooms: number | null;
  building: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minFloor: number | null;
  maxFloor: number | null;
  /** Surface range, always in real stored m² regardless of the visitor's
   * display `AreaUnit` preference (ft² is a presentation-only conversion —
   * see unitDisplay.ts's own doc comment). null = unbounded on that side. */
  minArea: number | null;
  maxArea: number | null;
  sort: SortOption;
}

export const DEFAULT_UNIT_FILTERS: UnitFilterState = {
  query: "",
  status: "all",
  bedrooms: null,
  bathrooms: null,
  building: null,
  minPrice: null,
  maxPrice: null,
  minFloor: null,
  maxFloor: null,
  minArea: null,
  maxArea: null,
  sort: "recommended",
};

/** How many of `DEFAULT_UNIT_FILTERS`' fields this state actually
 * diverges on — drives the render's own "Clear filters (2)" badge. Status
 * is deliberately excluded from the count regardless of its default value
 * (2026-08-18 direct instruction flipped that default from "available" to
 * "all": "Unit search default filtering after clicked 'units' is 'all' at
 * availability") — clearing filters returns to whichever status
 * `DEFAULT_UNIT_FILTERS.status` names, without that alone counting as an
 * "active" filter. */
export function activeFilterCount(state: UnitFilterState): number {
  let n = 0;
  if (state.bedrooms != null) n++;
  if (state.bathrooms != null) n++;
  if (state.building != null) n++;
  if (state.minPrice != null || state.maxPrice != null) n++;
  if (state.minFloor != null || state.maxFloor != null) n++;
  if (state.minArea != null || state.maxArea != null) n++;
  return n;
}

export function filterUnits(units: Unit[], state: UnitFilterState): Unit[] {
  const q = state.query.trim().toLowerCase();
  return units.filter((u) => {
    if (state.status !== "all" && u.status !== state.status) return false;
    if (state.bedrooms != null && u.bedrooms !== state.bedrooms) return false;
    if (state.bathrooms != null && u.bathrooms !== state.bathrooms) return false;
    if (state.building != null && u.buildingName !== state.building) return false;
    if (state.minPrice != null && u.price < state.minPrice) return false;
    if (state.maxPrice != null && u.price > state.maxPrice) return false;
    if (state.minFloor != null && u.floor < state.minFloor) return false;
    if (state.maxFloor != null && u.floor > state.maxFloor) return false;
    if (state.minArea != null && u.area < state.minArea) return false;
    if (state.maxArea != null && u.area > state.maxArea) return false;
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
