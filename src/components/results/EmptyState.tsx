"use client";

import { SearchX } from "lucide-react";
import { useAppStore } from "@/lib/store";

/** SEA-009: zero-result states must offer a concrete way forward. */
export function EmptyState() {
  const resetFilters = useAppStore((s) => s.resetFilters);
  const setFilters = useAppStore((s) => s.setFilters);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
        <SearchX className="h-5 w-5 text-neutral-400" />
      </div>
      <p className="text-sm font-semibold text-neutral-800">No properties match yet</p>
      <p className="max-w-xs text-sm text-neutral-500">
        Try widening the map area, clearing some filters, or browse Coming Soon
        developments in this neighborhood.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          onClick={resetFilters}
          className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          Clear filters
        </button>
        <button
          onClick={() => {
            requestFlyTo({ lat: 41.3275, lng: 19.8187, zoom: 12.4 });
          }}
          className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          Widen the map
        </button>
        <button
          onClick={() => setFilters({ projectsOnly: true })}
          className="rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-600"
        >
          View Coming Soon
        </button>
      </div>
    </div>
  );
}
