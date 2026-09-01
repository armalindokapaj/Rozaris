"use client";

import { X } from "lucide-react";
import { useAppStore, defaultFilters } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export function ActiveFilterChips() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const { t, locale } = useT();
  const labels = PROPERTY_TYPE_LABELS[locale];
  const chips: { label: string; clear: () => void }[] = [];

  if (filters.location && filters.location !== defaultFilters.location) {
    chips.push({ label: filters.location, clear: () => setFilters({ location: defaultFilters.location }) });
  }
  if (filters.transaction !== defaultFilters.transaction) {
    chips.push({ label: t("nav.rent"), clear: () => setFilters({ transaction: "buy", rentSubtype: undefined }) });
  }
  for (const type of filters.propertyTypes) {
    chips.push({ label: labels[type], clear: () => setFilters({ propertyTypes: filters.propertyTypes.filter((item) => item !== type) }) });
  }
  if (filters.priceMin != null || filters.priceMax != null) {
    const low = filters.priceMin != null ? formatPrice(filters.priceMin, "EUR", { compact: true }) : "Any";
    const high = filters.priceMax != null ? formatPrice(filters.priceMax, "EUR", { compact: true }) : "+";
    chips.push({ label: `${low} - ${high}`, clear: () => setFilters({ priceMin: null, priceMax: null }) });
  }
  if (filters.bedrooms != null) chips.push({ label: `${filters.bedrooms}+ ${t("filters.bedrooms")}`, clear: () => setFilters({ bedrooms: null }) });
  if (filters.bathrooms != null) chips.push({ label: `${filters.bathrooms}+ ${t("filters.bathrooms")}`, clear: () => setFilters({ bathrooms: null }) });
  if (filters.verifiedOnly) chips.push({ label: t("filters.verifiedOnly"), clear: () => setFilters({ verifiedOnly: false }) });
  if (filters.premiumOnly) chips.push({ label: t("filters.premiumOnly"), clear: () => setFilters({ premiumOnly: false }) });
  const advancedCount = filters.condition.length + filters.amenities.length + filters.essentialPOIs.length + Number(filters.buildingPermit);
  if (advancedCount) {
    chips.push({
      label: `${t("filters.moreFilters")} (${advancedCount})`,
      clear: () => setFilters({ condition: [], amenities: [], essentialPOIs: [], buildingPermit: false }),
    });
  }
  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3" aria-label="Active filters">
      {chips.map((chip) => <button key={chip.label} type="button" onClick={chip.clear} className="flex min-h-8 items-center gap-1 rounded-pill bg-neutral-100 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"><span>{chip.label}</span><X className="h-3.5 w-3.5" aria-hidden="true" /></button>)}
      <button type="button" onClick={resetFilters} className="min-h-8 px-2 text-xs font-semibold text-brand-600 hover:text-brand-700">{t("filters.resetAllFilters")}</button>
    </div>
  );
}
