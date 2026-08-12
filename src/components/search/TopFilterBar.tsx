"use client";

import { MapPin, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useAppStore, defaultFilters } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import {
  AMENITY_LABELS,
  CONDITION_LABELS,
  POI_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/constants";
import type { Amenity, Condition, EssentialPOI } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import { mainFieldsFor } from "@/lib/propertyTypeFields";
import { PROPERTY_TYPES, priceScaleFor } from "./FiltersForm";
import { RangeSlider } from "./RangeSlider";
import { FilterDropdown } from "./FilterDropdown";
import { SearchBar } from "./SearchBar";

const CONDITIONS: Condition[] = ["new", "renovated", "good", "needs_renovation"];
const AMENITIES: Amenity[] = [
  "elevator",
  "parking",
  "garage",
  "balcony",
  "terrace",
  "garden",
  "pool",
  "accessibility",
  "furnished",
];
const POIS: EssentialPOI[] = ["school", "university", "bus_stop", "hospital"];

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
      )}
    >
      {children}
    </button>
  );
}

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      {children}
    </div>
  );
}

/**
 * Desktop-only minimal filter row for the Search page — a strip of
 * collapsed pills (Location, Buy/Rent, Property type, Price, Beds & Baths,
 * More filters) that each expand into a popover on click, rather than the
 * always-open sidebar the map/list panels used to sit next to. Mobile keeps
 * its own row (MobileSearchRow) which already worked this way.
 */
export function TopFilterBar({ className }: { className?: string }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const conditionLabels = CONDITION_LABELS[locale];
  const amenityLabels = AMENITY_LABELS[locale];
  const poiLabels = POI_LABELS[locale];

  const activeType = filters.propertyTypes[filters.propertyTypes.length - 1];
  const activeFields = mainFieldsFor(activeType);
  const showBedBath = activeFields.includes("bedrooms") || activeFields.includes("bathrooms");

  const priceScale = priceScaleFor(filters);
  const priceIsSet = filters.priceMin != null || filters.priceMax != null;
  const priceLabel = priceIsSet
    ? `${formatPrice(filters.priceMin ?? priceScale.min, "EUR", { compact: true })}–${
        filters.priceMax != null ? formatPrice(filters.priceMax, "EUR", { compact: true }) : "+"
      }`
    : t("filters.priceShort");

  const bedsBathsSet = filters.bedrooms != null || filters.bathrooms != null;
  const bedsBathsLabel = bedsBathsSet
    ? [
        filters.bedrooms != null ? t("filters.countPlus", { count: filters.bedrooms }) : null,
        filters.bathrooms != null ? t("filters.countPlus", { count: filters.bathrooms }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("filters.bedsBaths");

  const typeCount = filters.propertyTypes.length;
  const typeLabel =
    typeCount === 0
      ? t("filters.propertyType")
      : typeCount === 1
      ? propertyTypeLabels[filters.propertyTypes[0]]
      : `${propertyTypeLabels[filters.propertyTypes[0]]} +${typeCount - 1}`;

  const advancedCount =
    filters.condition.length +
    filters.amenities.length +
    filters.essentialPOIs.length +
    (filters.verifiedOnly ? 1 : 0) +
    (filters.premiumOnly ? 1 : 0) +
    (filters.buildingPermit ? 1 : 0);

  const isDefault = JSON.stringify(filters) === JSON.stringify(defaultFilters);

  return (
    <div className={cn("grid grid-cols-12 gap-2", className)}>
      <SearchBar className="col-span-8" />
      {/* Buy / Rent */}
      <FilterDropdown
        className="col-span-4"
        label={filters.transaction === "rent" ? t("nav.rent") : t("nav.buy")}
        active={filters.transaction === "rent"}
      >
        {() => (
          <div className="space-y-3">
            <div className="relative grid grid-cols-2 rounded-control bg-neutral-100 p-1">
              <div
                className={cn(
                  "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-control bg-brand-500 shadow-[var(--shadow-1)] transition-transform duration-300 ease-in-out",
                  filters.transaction === "rent" && "translate-x-full"
                )}
                aria-hidden="true"
              />
              {(["buy", "rent"] as const).map((txn) => (
                <button
                  key={txn}
                  onClick={() => setTransaction(txn)}
                  className={cn(
                    "relative z-10 rounded-control py-2 text-sm font-semibold transition-colors duration-200",
                    filters.transaction === txn
                      ? "text-white"
                      : "text-neutral-500 hover:text-neutral-700 hover:bg-white/60"
                  )}
                >
                  {txn === "buy" ? t("nav.buy") : t("nav.rent")}
                </button>
              ))}
            </div>
            {filters.transaction === "rent" && (
              <div className="flex gap-2">
                {(["long_term", "daily"] as const).map((s) => (
                  <Pill
                    key={s}
                    active={filters.rentSubtype === s}
                    onClick={() =>
                      setFilters({
                        rentSubtype: filters.rentSubtype === s ? undefined : s,
                        priceMin: null,
                        priceMax: null,
                        areaMin: null,
                        areaMax: null,
                      })
                    }
                  >
                    {s === "daily" ? t("filters.dailyRent") : t("filters.longTermRent")}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        )}
      </FilterDropdown>

      {/* Location */}
      <FilterDropdown
        className="col-span-4"
        label={
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <span className="max-w-[9rem] truncate">{filters.location || t("filters.location")}</span>
          </span>
        }
        active={!!filters.location && filters.location !== defaultFilters.location}
      >
        {() => (
          <Section label={t("filters.location")}>
            <div className="flex items-center gap-2 rounded-control border border-neutral-200 px-3 py-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                value={filters.location}
                onChange={(e) => setFilters({ location: e.target.value })}
                placeholder={t("filters.locationPlaceholder")}
                className="w-full bg-transparent text-sm text-neutral-800 focus:outline-none"
              />
            </div>
          </Section>
        )}
      </FilterDropdown>

      {/* Property type */}
      <FilterDropdown className="col-span-4" label={typeLabel} active={typeCount > 0}>
        {() => (
          <Section label={t("filters.propertyType")}>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map((pt) => (
                <Pill
                  key={pt}
                  active={filters.propertyTypes.includes(pt)}
                  onClick={() =>
                    setFilters({ propertyTypes: toggleInArray(filters.propertyTypes, pt) })
                  }
                >
                  {propertyTypeLabels[pt]}
                </Pill>
              ))}
            </div>
          </Section>
        )}
      </FilterDropdown>

      {/* Price */}
      <FilterDropdown className="col-span-4" label={priceLabel} active={priceIsSet}>
        {() => (
          <Section label={t("filters.priceRangeEur")}>
            <RangeSlider
              scale={priceScale}
              valueMin={filters.priceMin}
              valueMax={filters.priceMax}
              onChange={(priceMin, priceMax) => setFilters({ priceMin, priceMax })}
              formatValue={(v) => formatPrice(v, "EUR", { compact: v > 99_000 })}
              ariaLabel={t("filters.priceRangeAria")}
            />
          </Section>
        )}
      </FilterDropdown>

      {/* Bedrooms / Bathrooms */}
      {showBedBath && (
        <FilterDropdown className="col-span-4" label={bedsBathsLabel} active={bedsBathsSet}>
          {() => (
            <div className="grid grid-cols-2 gap-4">
              <Section label={t("filters.bedrooms")}>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3].map((v) => (
                    <Pill
                      key={v}
                      active={filters.bedrooms === v}
                      onClick={() => setFilters({ bedrooms: filters.bedrooms === v ? null : v })}
                    >
                      {t("filters.countPlus", { count: v })}
                    </Pill>
                  ))}
                </div>
              </Section>
              <Section label={t("filters.bathrooms")}>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2].map((v) => (
                    <Pill
                      key={v}
                      active={filters.bathrooms === v}
                      onClick={() => setFilters({ bathrooms: filters.bathrooms === v ? null : v })}
                    >
                      {t("filters.countPlus", { count: v })}
                    </Pill>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </FilterDropdown>
      )}

      {/* More filters (condition / amenities / nearby / publisher) */}
      <FilterDropdown
        className="col-span-4"
        label={
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
            {t("filters.moreFilters")}
          </span>
        }
        active={advancedCount > 0}
        align="right"
        panelClassName="w-96 max-h-[70vh] overflow-y-auto scroll-thin space-y-5"
      >
        {() => (
          <>
            <Section label={t("filters.condition")}>
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => (
                  <Pill
                    key={c}
                    active={filters.condition.includes(c)}
                    onClick={() => setFilters({ condition: toggleInArray(filters.condition, c) })}
                  >
                    {conditionLabels[c]}
                  </Pill>
                ))}
              </div>
            </Section>
            <Section label={t("filters.amenities")}>
              <div className="flex flex-wrap gap-1.5">
                {AMENITIES.map((a) => (
                  <Pill
                    key={a}
                    active={filters.amenities.includes(a)}
                    onClick={() => setFilters({ amenities: toggleInArray(filters.amenities, a) })}
                  >
                    {amenityLabels[a]}
                  </Pill>
                ))}
              </div>
            </Section>
            <Section label={t("filters.nearbyEssentials")}>
              <div className="flex flex-wrap gap-1.5">
                {POIS.map((p) => (
                  <Pill
                    key={p}
                    active={filters.essentialPOIs.includes(p)}
                    onClick={() =>
                      setFilters({ essentialPOIs: toggleInArray(filters.essentialPOIs, p) })
                    }
                  >
                    {poiLabels[p]}
                  </Pill>
                ))}
              </div>
            </Section>
            <Section label={t("filters.publisher")}>
              <div className="flex flex-wrap gap-1.5">
                <Pill
                  active={filters.verifiedOnly}
                  onClick={() => setFilters({ verifiedOnly: !filters.verifiedOnly })}
                >
                  {t("filters.verifiedOnly")}
                </Pill>
                <Pill
                  active={filters.premiumOnly}
                  onClick={() => setFilters({ premiumOnly: !filters.premiumOnly })}
                >
                  {t("filters.premiumOnly")}
                </Pill>
              </div>
            </Section>
          </>
        )}
      </FilterDropdown>

      {!isDefault && (
        <button
          onClick={resetFilters}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-pill px-3 text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("filters.resetAllFilters")}
        </button>
      )}
    </div>
  );
}
