import type { Currency } from "@/lib/types";

/**
 * More / Settings Menu PRD §12 "Currency" — "reuse the same exchange-rate
 * and currency preference infrastructure as the rest of ROZARIS... Do not
 * create a Viewer-specific currency system." That infrastructure already
 * existed (`useAppStore`'s `currency`/`eurToAllRate`) but, before this,
 * had exactly one real consumer platform-wide: the admin
 * PlatformSettingsTab screen that lets an admin *set* the rate — nothing
 * public ever actually converted a displayed price with it. This is that
 * first real public consumer, scoped to the Units Search/Detail views
 * this session already built. Every real Unit row is EUR-denominated
 * (`unit.currency` is always "EUR" today); `eurToAllRate` is "how many ALL
 * per 1 EUR", matching PlatformSettingsTab's own admin-facing framing.
 */
export function convertUnitPrice(amountInUnitCurrency: number, unitCurrency: Currency, displayCurrency: Currency, eurToAllRate: number): number {
  if (unitCurrency === displayCurrency) return amountInUnitCurrency;
  if (unitCurrency === "EUR" && displayCurrency === "ALL") return amountInUnitCurrency * eurToAllRate;
  if (unitCurrency === "ALL" && displayCurrency === "EUR") return amountInUnitCurrency / eurToAllRate;
  return amountInUnitCurrency;
}

/** More / Settings Menu PRD §11 "Area Units" — m²/ft² is purely a display
 * conversion; "Underlying database values remain metric" (every real
 * `Unit.area` is stored in m²). 1 m² = 10.7639 ft². */
const SQM_TO_SQFT = 10.7639;

export function formatUnitArea(areaSqm: number, unit: "m2" | "ft2"): string {
  if (unit === "ft2") return `${Math.round(areaSqm * SQM_TO_SQFT)} ft²`;
  return `${areaSqm} m²`;
}

/** The same conversion as a raw number rather than a formatted string —
 * for a *typed* surface bound (UnitSearchView's own Surface min/max
 * fields), where the visitor enters a number in whatever unit every row
 * around it is displayed in, and `UnitFilterState.minArea`/`maxArea` still
 * have to end up in real stored m² (see `unitFilters.ts`'s own note on
 * that field). Round-trips through `areaFromDisplay` below. */
export function areaToDisplay(areaSqm: number, unit: "m2" | "ft2"): number {
  return unit === "ft2" ? Math.round(areaSqm * SQM_TO_SQFT) : areaSqm;
}

/** Inverse of `areaToDisplay` — a visitor-entered bound back into stored
 * m². Rounded, not left at full float precision: the value is compared
 * against whole-m² `Unit.area` rows, and an un-rounded 92.90304 reads as
 * noise the moment it's echoed back into the field. */
export function areaFromDisplay(value: number, unit: "m2" | "ft2"): number {
  return unit === "ft2" ? Math.round(value / SQM_TO_SQFT) : value;
}
