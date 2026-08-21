"use client";

import { useEffect, useState } from "react";

export type LocationOption = {
  id: string;
  type: string;
  officialName: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
  cityName: string;
};

/**
 * Client-side read of the real Canonical Location System (`GET
 * /api/locations`) — see MEMORY note "rozaris-controlled-taxonomy-spec".
 * Replaces the fixed `mockData.neighborhoods` array every location
 * dropdown used to read (NewListingForm, NewProjectModal,
 * EditProjectModal), which could drift from what the write-side routes
 * actually validate against now. Empty array until the fetch resolves —
 * every caller already renders an empty `<select>` gracefully during
 * initial load, same as before this hook existed.
 *
 * `type` accepts more than one level at once (e.g. `["neighborhood",
 * "village"]`) — a "pick this listing's exact location" dropdown needs
 * both, since a unit can sit directly in a Village with no neighborhood
 * layer at all (2026-08-21 spec).
 */
export function useLocations(type: string | string[]): LocationOption[] {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const typeParam = Array.isArray(type) ? type.join(",") : type;

  useEffect(() => {
    fetch(`/api/locations?type=${encodeURIComponent(typeParam)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setLocations)
      .catch(() => {});
  }, [typeParam]);

  return locations;
}
