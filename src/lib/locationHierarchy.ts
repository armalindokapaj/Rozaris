/**
 * Canonical Location System's real, enforced shape — user's 2026-08-21
 * spec: "Municipality (Albania doesn't have Counties) / City / Village (if
 * the unit is in village) / Neighbourhood". Isomorphic (no `@/lib/db`
 * import) so both server routes (`/api/locations`, `/api/admin/locations*`
 * — validation) and client components (`LocationsTab` and its siblings —
 * filtering the "Add location" form's parent picker to only legal options
 * before it ever reaches the server) read the exact same rule, rather than
 * two hand-kept-in-sync copies drifting apart.
 */
export type LocationTypeValue = "municipality" | "city" | "village" | "neighborhood";

export const LOCATION_TYPES: LocationTypeValue[] = ["municipality", "city", "village", "neighborhood"];

/** Which parent type(s) each location type may legally have — `[]` means
 * "must be top-level, no parent at all" (only Municipality). A Village is
 * a sibling of City under the same Municipality, not a City subtype. A
 * Neighbourhood's parent is a City OR a Municipality directly (the
 * Himarë/Dhërmi shape — a municipality/village with no distinct city
 * center). */
export const ALLOWED_PARENT_TYPES: Record<LocationTypeValue, LocationTypeValue[]> = {
  municipality: [],
  city: ["municipality"],
  village: ["municipality"],
  neighborhood: ["city", "municipality"],
};
