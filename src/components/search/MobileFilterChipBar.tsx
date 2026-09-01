"use client";

import { SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { cn, formatPrice } from "@/lib/utils";

export function MobileFilterChipBar({ onOpenFilters }: { onOpenFilters: () => void }) {
  const filters = useAppStore((s) => s.filters);
  const { t, locale } = useT();
  const typeLabels = PROPERTY_TYPE_LABELS[locale];

  const typeLabel =
    filters.propertyTypes.length === 1
      ? typeLabels[filters.propertyTypes[0]]
      : filters.propertyTypes.length > 1
      ? `${typeLabels[filters.propertyTypes[0]]} +${filters.propertyTypes.length - 1}`
      : t("filters.propertyType");

  const priceActive = filters.priceMin != null || filters.priceMax != null;
  const priceLabel = priceActive
    ? [
        filters.priceMin ? formatPrice(filters.priceMin, "EUR", { compact: true }) : "",
        filters.priceMax ? formatPrice(filters.priceMax, "EUR", { compact: true }) : "",
      ]
        .filter(Boolean)
        .join(" – ")
    : t("filters.priceShort");

  const bedsLabel = filters.bedrooms != null ? `${filters.bedrooms}+ ${t("filters.bedrooms")}` : t("filters.bedrooms");

  const chips = [
    { key: "type", label: typeLabel, active: filters.propertyTypes.length > 0 },
    { key: "price", label: priceLabel, active: priceActive },
    { key: "beds", label: bedsLabel, active: filters.bedrooms != null },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto scroll-thin border-b border-neutral-100 bg-white px-4 py-2 lg:hidden">
      <button
        onClick={onOpenFilters}
        aria-label={t("home.openFilters")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill border border-neutral-200 text-neutral-600"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={onOpenFilters}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors",
            chip.active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-200 text-neutral-600"
          )}
        >
          {chip.label}
        </button>
      ))}
      <button
        onClick={onOpenFilters}
        className="shrink-0 whitespace-nowrap rounded-pill border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600"
      >
        {t("filters.moreFilters")}
      </button>
    </div>
  );
}
