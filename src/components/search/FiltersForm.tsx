"use client";

import { useState } from "react";
import { ChevronDown, MapPin, RotateCcw } from "lucide-react";
import { useAppStore, defaultFilters } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import {
  AMENITY_LABELS,
  CONDITION_LABELS,
  POI_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/constants";
import type { Amenity, Condition, EssentialPOI, FilterState, PropertyType } from "@/lib/types";
import { cn, formatArea, formatPrice } from "@/lib/utils";
import { RangeSlider, type SliderScale } from "./RangeSlider";

// Buy: fine 10k-EUR snapping from 10k-300k (the range most buyers search
// within) packed into 70% of the track width; coarser steps beyond that.
const BUY_PRICE_SCALE: SliderScale = {
  min: 10_000,
  max: 1_000_000,
  breakpoint: 300_000,
  breakpointFraction: 0.7,
  step: 10_000,
  stepAfterBreakpoint: 50_000,
};
const BUY_AREA_SCALE: SliderScale = {
  min: 30,
  max: 400,
  breakpoint: 200,
  breakpointFraction: 0.7,
  step: 10,
  stepAfterBreakpoint: 50,
};
// Long-term rent
const RENT_PRICE_SCALE: SliderScale = { min: 100, max: 1_500, step: 50 };
const RENT_AREA_SCALE: SliderScale = { min: 30, max: 1_500, step: 10 };
// Daily (short-term) rent — much lower price/area domain than long-term
const DAILY_RENT_PRICE_SCALE: SliderScale = { min: 20, max: 300, step: 10 };
const DAILY_RENT_AREA_SCALE: SliderScale = { min: 30, max: 150, step: 10 };

function priceScaleFor(filters: FilterState): SliderScale {
  if (filters.transaction !== "rent") return BUY_PRICE_SCALE;
  return filters.rentSubtype === "daily" ? DAILY_RENT_PRICE_SCALE : RENT_PRICE_SCALE;
}
function areaScaleFor(filters: FilterState): SliderScale {
  if (filters.transaction !== "rent") return BUY_AREA_SCALE;
  return filters.rentSubtype === "daily" ? DAILY_RENT_AREA_SCALE : RENT_AREA_SCALE;
}

const PROPERTY_TYPES: PropertyType[] = [
  "apartment",
  "villa",
  "studio",
  "land",
  "commercial",
  "office",
];
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      {children}
    </div>
  );
}

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

export function FiltersForm({ compact = false }: { compact?: boolean }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { t, locale } = useT();
  const propertyTypeLabels = PROPERTY_TYPE_LABELS[locale];
  const conditionLabels = CONDITION_LABELS[locale];
  const amenityLabels = AMENITY_LABELS[locale];
  const poiLabels = POI_LABELS[locale];

  return (
    <div className={cn("space-y-5", compact ? "px-4 py-4" : "p-5")}>
      {/* Buy / Rent — a sliding accent-colored "switch" so toggling reads as
          on/off rather than an abrupt background swap. */}
      <div className="relative grid grid-cols-2 rounded-control bg-neutral-100 p-1">
        <div
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[10px] bg-brand-500 shadow-sm transition-transform duration-300 ease-in-out",
            filters.transaction === "rent" && "translate-x-full"
          )}
          aria-hidden="true"
        />
        {(["buy", "rent"] as const).map((txn) => (
          <button
            key={txn}
            onClick={() => setTransaction(txn)}
            className={cn(
              "relative z-10 rounded-[10px] py-2 text-sm font-semibold transition-colors duration-200",
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
                  // Daily and long-term rent use different price/area
                  // scales, so a value picked under one is out of range
                  // under the other.
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

      {/* Location */}
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

      {/* Property type */}
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

      {/* Price */}
      <Section label={t("filters.priceRangeEur")}>
        <RangeSlider
          scale={priceScaleFor(filters)}
          valueMin={filters.priceMin}
          valueMax={filters.priceMax}
          onChange={(priceMin, priceMax) => setFilters({ priceMin, priceMax })}
          formatValue={(v) => formatPrice(v, "EUR", { compact: v > 99_000 })}
          ariaLabel={t("filters.priceRangeAria")}
        />
      </Section>

      {/* Area */}
      <Section label={t("filters.areaM2")}>
        <RangeSlider
          scale={areaScaleFor(filters)}
          valueMin={filters.areaMin}
          valueMax={filters.areaMax}
          onChange={(areaMin, areaMax) => setFilters({ areaMin, areaMax })}
          formatValue={formatArea}
          ariaLabel={t("filters.areaRangeAria")}
        />
      </Section>

      {/* Bedrooms / Bathrooms */}
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

      {/* More filters toggle */}
      <button
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="flex w-full items-center justify-between rounded-control border border-neutral-200 px-3.5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        {t("filters.moreFilters")}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")}
        />
      </button>

      {advancedOpen && (
        <div className="space-y-5 rounded-card bg-neutral-50 p-4">
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
                  onClick={() =>
                    setFilters({ amenities: toggleInArray(filters.amenities, a) })
                  }
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
        </div>
      )}

      <button
        onClick={resetFilters}
        disabled={JSON.stringify(filters) === JSON.stringify(defaultFilters)}
        className="flex w-full items-center justify-center gap-1.5 rounded-control py-2 text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600 disabled:opacity-40 disabled:hover:text-neutral-500"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t("filters.resetAllFilters")}
      </button>
    </div>
  );
}
