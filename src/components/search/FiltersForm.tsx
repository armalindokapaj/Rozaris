"use client";

import { useState } from "react";
import { ChevronDown, MapPin, RotateCcw } from "lucide-react";
import { useAppStore, defaultFilters } from "@/lib/store";
import {
  AMENITY_LABELS,
  CONDITION_LABELS,
  POI_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/constants";
import type { Amenity, Condition, EssentialPOI, PropertyType } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROPERTY_TYPES: PropertyType[] = [
  "apartment",
  "house",
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
  const resetFilters = useAppStore((s) => s.resetFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("space-y-5", compact ? "px-4 py-4" : "p-5")}>
      {/* Buy / Rent */}
      <div className="grid grid-cols-2 gap-2 rounded-control bg-neutral-100 p-1">
        {(["buy", "rent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilters({ transaction: t })}
            className={cn(
              "rounded-[10px] py-2 text-sm font-semibold capitalize transition-colors",
              filters.transaction === t
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            {t}
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
                setFilters({ rentSubtype: filters.rentSubtype === s ? undefined : s })
              }
            >
              {s === "daily" ? "Daily rent" : "Long-term rent"}
            </Pill>
          ))}
        </div>
      )}

      {/* Location */}
      <Section label="Location">
        <div className="flex items-center gap-2 rounded-control border border-neutral-200 px-3 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            value={filters.location}
            onChange={(e) => setFilters({ location: e.target.value })}
            placeholder="City or neighborhood"
            className="w-full bg-transparent text-sm text-neutral-800 focus:outline-none"
          />
        </div>
      </Section>

      {/* Property type */}
      <Section label="Property type">
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_TYPES.map((t) => (
            <Pill
              key={t}
              active={filters.propertyTypes.includes(t)}
              onClick={() =>
                setFilters({ propertyTypes: toggleInArray(filters.propertyTypes, t) })
              }
            >
              {PROPERTY_TYPE_LABELS[t]}
            </Pill>
          ))}
        </div>
      </Section>

      {/* Price */}
      <Section label="Price range (EUR)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            value={filters.priceMin ?? ""}
            onChange={(e) =>
              setFilters({ priceMin: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <span className="text-neutral-300">—</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            value={filters.priceMax ?? ""}
            onChange={(e) =>
              setFilters({ priceMax: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
      </Section>

      {/* Area */}
      <Section label="Area (m²)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            value={filters.areaMin ?? ""}
            onChange={(e) =>
              setFilters({ areaMin: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <span className="text-neutral-300">—</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            value={filters.areaMax ?? ""}
            onChange={(e) =>
              setFilters({ areaMax: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
      </Section>

      {/* Bedrooms / Bathrooms */}
      <div className="grid grid-cols-2 gap-4">
        <Section label="Bedrooms">
          <div className="flex flex-wrap gap-1.5">
            {[null, 1, 2, 3, 4].map((v) => (
              <Pill
                key={String(v)}
                active={filters.bedrooms === v}
                onClick={() => setFilters({ bedrooms: v })}
              >
                {v === null ? "Any" : `${v}+`}
              </Pill>
            ))}
          </div>
        </Section>
        <Section label="Bathrooms">
          <div className="flex flex-wrap gap-1.5">
            {[null, 1, 2, 3].map((v) => (
              <Pill
                key={String(v)}
                active={filters.bathrooms === v}
                onClick={() => setFilters({ bathrooms: v })}
              >
                {v === null ? "Any" : `${v}+`}
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
        More filters
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")}
        />
      </button>

      {advancedOpen && (
        <div className="space-y-5 rounded-card bg-neutral-50 p-4">
          <Section label="Condition">
            <div className="flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <Pill
                  key={c}
                  active={filters.condition.includes(c)}
                  onClick={() => setFilters({ condition: toggleInArray(filters.condition, c) })}
                >
                  {CONDITION_LABELS[c]}
                </Pill>
              ))}
            </div>
          </Section>
          <Section label="Amenities">
            <div className="flex flex-wrap gap-1.5">
              {AMENITIES.map((a) => (
                <Pill
                  key={a}
                  active={filters.amenities.includes(a)}
                  onClick={() =>
                    setFilters({ amenities: toggleInArray(filters.amenities, a) })
                  }
                >
                  {AMENITY_LABELS[a]}
                </Pill>
              ))}
            </div>
          </Section>
          <Section label="Nearby essentials">
            <div className="flex flex-wrap gap-1.5">
              {POIS.map((p) => (
                <Pill
                  key={p}
                  active={filters.essentialPOIs.includes(p)}
                  onClick={() =>
                    setFilters({ essentialPOIs: toggleInArray(filters.essentialPOIs, p) })
                  }
                >
                  {POI_LABELS[p]}
                </Pill>
              ))}
            </div>
          </Section>
          <Section label="Publisher">
            <div className="flex flex-wrap gap-1.5">
              <Pill
                active={filters.verifiedOnly}
                onClick={() => setFilters({ verifiedOnly: !filters.verifiedOnly })}
              >
                Verified only
              </Pill>
              <Pill
                active={filters.premiumOnly}
                onClick={() => setFilters({ premiumOnly: !filters.premiumOnly })}
              >
                Premium only
              </Pill>
            </div>
          </Section>
        </div>
      )}

      <button
        onClick={resetFilters}
        disabled={JSON.stringify(filters) === JSON.stringify(defaultFilters)}
        className="flex w-full items-center justify-center gap-1.5 rounded-control py-2 text-sm font-medium text-neutral-500 hover:text-neutral-800 disabled:opacity-40"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset all filters
      </button>
    </div>
  );
}
