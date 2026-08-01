"use client";

import { SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { SearchBar } from "@/components/search/SearchBar";
import { cn } from "@/lib/utils";

export function MobileSearchRow({ onOpenFilters }: { onOpenFilters: () => void }) {
  const filters = useAppStore((s) => s.filters);
  const { t } = useT();
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
    <div className="flex items-center gap-2 border-b border-neutral-100 bg-white px-4 py-2 lg:hidden">
      <SearchBar compact className="flex-1" />
      <button
        onClick={onOpenFilters}
        aria-label={t("home.openFilters")}
        className={cn(
          "relative flex h-10 shrink-0 items-center gap-1.5 rounded-control border border-neutral-200 px-3 text-sm font-medium text-neutral-600"
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t("home.filterButton")}
        {activeFilterCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}
