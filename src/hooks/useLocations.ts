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
