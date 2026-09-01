"use client";

import { useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
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
import { PROPERTY_TYPES, areaScaleFor, priceScaleFor } from "./FiltersForm";
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
        "border px-2.5 py-1.5 text-sm font-semibold transition-colors",
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
    <div className="space-y-1.5">
      <p className="border-b border-neutral-300 pb-1.5 text-sm font-bold text-neutral-700">{label}</p>
      {children}
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <span className="h-px flex-1 bg-neutral-200" aria-hidden="true" />
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <GroupHeader label={label} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border border-neutral-200 p-3 sm:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function CheckboxOption({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 rounded-none border-neutral-300 text-brand-500 focus:ring-1 focus:ring-brand-500 focus:ring-offset-0"
      />
      <span>{children}</span>
    </label>
  );
}

export function TopFilterBar({ className }: { className?: string }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const [moreOpen, setMoreOpen] = useState(false);
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const conditionLabels = CONDITION_LABELS[locale];
  const amenityLabels = AMENITY_LABELS[locale];
  const poiLabels = POI_LABELS[locale];

  const activeType = filters.propertyTypes[filters.propertyTypes.length - 1];
  const activeFields = mainFieldsFor(activeType);
  const showBedBath = activeFields.includes("bedrooms") || activeFields.includes("bathrooms");

  const priceScale = priceScaleFor(filters);
  const areaScale = areaScaleFor(filters);
  const priceIsSet = filters.priceMin != null || filters.priceMax != null;
  const priceLabel = priceIsSet
    ? `${formatPrice(filters.priceMin ?? priceScale.min, "EUR", { compact: true })}–${
        filters.priceMax != null ? formatPrice(filters.priceMax, "EUR", { compact: true }) : "+"
      }`
    : t("filters.priceShort");
  const areaIsSet = filters.areaMin != null || filters.areaMax != null;

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
    (filters.buildingPermit ? 1 : 0) +
    (areaIsSet ? 1 : 0);

  const isDefault = JSON.stringify(filters) === JSON.stringify(defaultFilters);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterDropdown
          className="w-32 shrink-0"
          label={filters.transaction === "rent" ? t("nav.rent") : t("nav.buy")}
          active={filters.transaction === "rent"}
        >
          {(close) => (
            <div className="grid gap-1">
              {(["buy", "rent"] as const).map((txn) => (
                <button
                  key={txn}
                  onClick={() => { setTransaction(txn); close(); }}
                  className={cn("flex w-full items-center justify-between px-2.5 py-2 text-left text-sm font-semibold transition-colors", filters.transaction === txn ? "bg-brand-50 text-brand-700" : "text-neutral-700 hover:bg-neutral-100")}
                >
                  {txn === "buy" ? t("nav.buy") : t("nav.rent")}
                </button>
              ))}
              {filters.transaction === "rent" && (
                <div className="border-t border-neutral-200 pt-2">
                  {(["long_term", "daily"] as const).map((s) => <Pill key={s} active={filters.rentSubtype === s} onClick={() => setFilters({ rentSubtype: filters.rentSubtype === s ? undefined : s, priceMin: null, priceMax: null, areaMin: null, areaMax: null })}>{s === "daily" ? t("filters.dailyRent") : t("filters.longTermRent")}</Pill>)}
                </div>
              )}
            </div>
          )}
        </FilterDropdown>

        <SearchBar className="min-w-[180px] flex-1" />

        {                                                                
                                   }
        <FilterDropdown className="w-40 shrink-0" label={typeLabel} active={typeCount > 0}>
          {(close) => (
            <div className="grid gap-1">
                {PROPERTY_TYPES.map((pt) => (
                  <button
                    key={pt}
                    onClick={() => { setFilters({ propertyTypes: [pt] }); close(); }}
                    className={cn("w-full px-2.5 py-2 text-left text-sm font-semibold transition-colors", filters.propertyTypes.includes(pt) ? "bg-brand-50 text-brand-700" : "text-neutral-700 hover:bg-neutral-100")}
                  >
                    {propertyTypeLabels[pt]}
                  </button>
                ))}
            </div>
          )}
        </FilterDropdown>

        {                                                                   
                                                                           }
        <FilterDropdown
          className="w-32 shrink-0"
          panelClassName="w-[22.75rem]"
          label={priceLabel}
          active={priceIsSet}
        >
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

        {                                                                        }
        {showBedBath && (
          <>
            <FilterDropdown
              className="w-28 shrink-0"
              label={filters.bedrooms != null ? t("filters.countPlus", { count: filters.bedrooms }) : t("filters.bedrooms")}
              active={filters.bedrooms != null}
            >
              {() => (
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
              )}
            </FilterDropdown>

            <FilterDropdown
              className="w-28 shrink-0"
              label={filters.bathrooms != null ? t("filters.countPlus", { count: filters.bathrooms }) : t("filters.bathrooms")}
              active={filters.bathrooms != null}
            >
              {() => (
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
              )}
            </FilterDropdown>
          </>
        )}

        {                                                                  
                                                                   }
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-label={t("filters.moreFilters")}
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center border transition-colors",
            moreOpen || advancedCount > 0
              ? "border-neutral-800 text-neutral-900"
              : "border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
          )}
        >
          {moreOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {advancedCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
              {advancedCount}
            </span>
          )}
        </button>

        {!isDefault && (
          <button
            onClick={resetFilters}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("filters.resetAllFilters")}
          </button>
        )}
      </div>

      {                                                                     
                                     }
      {moreOpen && (
        <div className="space-y-4 border border-neutral-200 bg-white p-4">
          <div>
            <GroupHeader label={t("filters.areaM2")} />
            <div className="border border-neutral-200 p-3">
              <RangeSlider
                scale={areaScale}
                valueMin={filters.areaMin}
                valueMax={filters.areaMax}
                onChange={(areaMin, areaMax) => setFilters({ areaMin, areaMax })}
                formatValue={(value) => `${value} m²`}
                ariaLabel={t("filters.areaRangeAria")}
              />
            </div>
          </div>

          <Group label={t("filters.condition")}>
            {CONDITIONS.map((c) => (
              <CheckboxOption
                key={c}
                checked={filters.condition.includes(c)}
                onChange={() => setFilters({ condition: toggleInArray(filters.condition, c) })}
              >
                {conditionLabels[c]}
              </CheckboxOption>
            ))}
          </Group>

          <Group label={t("filters.amenities")}>
            {AMENITIES.map((a) => (
              <CheckboxOption
                key={a}
                checked={filters.amenities.includes(a)}
                onChange={() => setFilters({ amenities: toggleInArray(filters.amenities, a) })}
              >
                {amenityLabels[a]}
              </CheckboxOption>
            ))}
          </Group>

          <Group label={t("filters.nearbyEssentials")}>
            {POIS.map((p) => (
              <CheckboxOption
                key={p}
                checked={filters.essentialPOIs.includes(p)}
                onChange={() =>
                  setFilters({ essentialPOIs: toggleInArray(filters.essentialPOIs, p) })
                }
              >
                {poiLabels[p]}
              </CheckboxOption>
            ))}
          </Group>

          <Group label={t("filters.publisher")}>
            <CheckboxOption
              checked={filters.verifiedOnly}
              onChange={() => setFilters({ verifiedOnly: !filters.verifiedOnly })}
            >
              {t("filters.verifiedOnly")}
            </CheckboxOption>
            <CheckboxOption
              checked={filters.premiumOnly}
              onChange={() => setFilters({ premiumOnly: !filters.premiumOnly })}
            >
              {t("filters.premiumOnly")}
            </CheckboxOption>
          </Group>
        </div>
      )}
    </div>
  );
}
