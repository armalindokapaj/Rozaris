"use client";

import { SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { SearchBar } from "@/components/search/SearchBar";
import { cn } from "@/lib/utils";

export function MobileSearchRow({ onOpenFilters }: { onOpenFilters: () => void }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const activeFilterCount =
    filters.propertyTypes.length +
    (filters.priceMin || filters.priceMax ? 1 : 0) +
    (filters.areaMin || filters.areaMax ? 1 : 0) +
    (filters.bedrooms ? 1 : 0) +
    (filters.bathrooms ? 1 : 0) +
    filters.condition.length +
    filters.amenities.length +
    filters.essentialPOIs.length +
    (filters.verifiedOnly ? 1 : 0) +
    (filters.premiumOnly ? 1 : 0);

  return (
    <div className="space-y-2.5 border-b border-neutral-100 bg-white px-4 pb-3 pt-2.5 lg:hidden">
      <div className="flex gap-2">
        {(
          [
            ["buy", "Buy"],
            ["rent", "Rent"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setFilters({ transaction: t, projectsOnly: false })}
            className={cn(
              "rounded-control px-3.5 py-1.5 text-sm font-semibold",
              filters.transaction === t && !filters.projectsOnly
                ? "bg-brand-500 text-white"
                : "bg-neutral-100 text-neutral-600"
            )}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setFilters({ projectsOnly: true })}
          className={cn(
            "rounded-control px-3.5 py-1.5 text-sm font-semibold",
            filters.projectsOnly ? "bg-brand-500 text-white" : "bg-neutral-100 text-neutral-600"
          )}
        >
          New Projects
        </button>
      </div>
      <div className="flex items-center gap-2">
        <SearchBar className="flex-1" />
        <button
          onClick={onOpenFilters}
          aria-label="Open filters"
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-neutral-200 text-neutral-600"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
