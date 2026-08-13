"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, MapPin, SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { useT } from "@/lib/i18n/useT";
import { cn, formatPrice } from "@/lib/utils";
import { PROPERTY_TYPES, priceScaleFor } from "@/components/search/FiltersForm";
import { RangeSlider } from "@/components/search/RangeSlider";
import type { PropertyType } from "@/lib/types";

type Menu = "type" | "location" | "price" | "bedrooms" | "bathrooms" | "area" | "more" | null;

function Word({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 border-b border-brand-400 px-0.5 font-bold text-brand-600 transition-colors duration-150 hover:border-brand-700 hover:text-brand-700"
    >
      {children}
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

function Chip({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 border px-2.5 py-2 text-left transition-all duration-150 ease-[var(--ease-rz)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)]",
        active ? "border-brand-500 bg-brand-50" : "border-neutral-200 bg-white hover:border-brand-300"
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      <span className={cn("flex items-center gap-1 text-sm font-bold", active ? "text-brand-700" : "text-neutral-800")}>
        {value}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </span>
    </button>
  );
}

function Choices({ values, selected, onChange }: { values: number[]; selected: number | null; onChange: (value: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <button
          key={value}
          onClick={() => onChange(selected === value ? null : value)}
          className={cn(
            "border px-3 py-2 text-sm font-semibold transition-colors duration-150",
            selected === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-300 text-neutral-700 hover:border-brand-300"
          )}
        >
          {value}+
        </button>
      ))}
    </div>
  );
}

export function LandingSearchCard({ onSubmit }: { onSubmit: () => void }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const { t, locale } = useT();
  const [menu, setMenu] = useState<Menu>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const type = filters.propertyTypes.at(-1) as PropertyType | undefined;
  const labels = PROPERTY_TYPE_LABELS[locale];
  const priceScale = priceScaleFor(filters);

  const priceLabel =
    filters.priceMin != null || filters.priceMax != null
      ? `${filters.priceMin ? formatPrice(filters.priceMin, "EUR", { compact: true }) : "0"}–${filters.priceMax ? formatPrice(filters.priceMax, "EUR", { compact: true }) : "∞"}`
      : "Any";
  const areaLabel = filters.areaMin != null || filters.areaMax != null ? `${filters.areaMin ?? 0}–${filters.areaMax ?? "∞"} m²` : "Any";
  const bedroomsLabel = filters.bedrooms != null ? `${filters.bedrooms}+` : "Any";
  const bathroomsLabel = filters.bathrooms != null ? `${filters.bathrooms}+` : "Any";

  const content =
    menu === "type" ? (
      <div className="grid grid-cols-2 gap-2">
        {PROPERTY_TYPES.map((value) => (
          <button
            key={value}
            onClick={() => {
              setFilters({ propertyTypes: [value] });
              setMenu(null);
            }}
            className={cn(
              "border px-3 py-2 text-left text-sm font-semibold transition-colors duration-150",
              type === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-200 text-neutral-700 hover:border-neutral-400"
            )}
          >
            {labels[value]}
          </button>
        ))}
      </div>
    ) : menu === "location" ? (
      <input
        autoFocus
        value={filters.location}
        onChange={(event) => setFilters({ location: event.target.value })}
        placeholder={t("filters.locationPlaceholder")}
        className="h-11 w-full border border-neutral-300 px-3 text-sm outline-none focus:border-brand-500"
      />
    ) : menu === "price" ? (
      <RangeSlider scale={priceScale} valueMin={filters.priceMin} valueMax={filters.priceMax} onChange={(priceMin, priceMax) => setFilters({ priceMin, priceMax })} formatValue={(value) => formatPrice(value, "EUR", { compact: true })} ariaLabel={t("filters.priceRangeAria")} />
    ) : menu === "area" ? (
      <RangeSlider scale={{ min: 30, max: 400, step: 10 }} valueMin={filters.areaMin} valueMax={filters.areaMax} onChange={(areaMin, areaMax) => setFilters({ areaMin, areaMax })} formatValue={(value) => `${value} m²`} ariaLabel={t("filters.areaRangeAria")} />
    ) : menu === "bedrooms" ? (
      <Choices values={[1, 2, 3, 4]} selected={filters.bedrooms} onChange={(bedrooms) => setFilters({ bedrooms })} />
    ) : menu === "bathrooms" ? (
      <Choices values={[1, 2, 3]} selected={filters.bathrooms} onChange={(bathrooms) => setFilters({ bathrooms })} />
    ) : menu === "more" ? (
      <button
        onClick={() => setFilters({ premiumOnly: !filters.premiumOnly })}
        className={cn("border px-3 py-2 text-sm font-semibold transition-colors duration-150", filters.premiumOnly ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-300 hover:border-brand-300")}
      >
        {t("filters.premiumOnly")}
      </button>
    ) : null;

  const clearable = menu === "price" ? filters.priceMin != null || filters.priceMax != null
    : menu === "area" ? filters.areaMin != null || filters.areaMax != null
    : menu === "bedrooms" ? filters.bedrooms != null
    : menu === "bathrooms" ? filters.bathrooms != null
    : false;

  function clearMenu() {
    if (menu === "price") setFilters({ priceMin: null, priceMax: null });
    if (menu === "area") setFilters({ areaMin: null, areaMax: null });
    if (menu === "bedrooms") setFilters({ bedrooms: null });
    if (menu === "bathrooms") setFilters({ bathrooms: null });
    setMenu(null);
  }

  return (
    <div ref={rootRef} className="relative px-5 pb-5 pt-5 sm:px-7">
      <div className="text-base leading-relaxed text-neutral-900">
        <span>I&apos;m looking to </span>
        <button
          onClick={() => setTransaction(filters.transaction === "rent" ? "buy" : "rent")}
          className="border-b border-brand-400 px-0.5 font-bold text-brand-600 transition-colors duration-150 hover:border-brand-700 hover:text-brand-700"
        >
          {filters.transaction === "rent" ? t("nav.rent") : t("nav.buy")}
        </button>
        <span> a </span>
        <Word onClick={() => setMenu(menu === "type" ? null : "type")}>{type ? labels[type] : t("filters.propertyType")}</Word>
        <span> in</span>
      </div>

      <button
        onClick={() => setMenu(menu === "location" ? null : "location")}
        className="mt-1.5 flex items-center gap-2 text-base font-bold text-brand-600 transition-colors duration-150 hover:text-brand-700"
      >
        <MapPin className="h-4 w-4 shrink-0" />
        {filters.location || t("filters.location")}
        <ChevronDown className="h-4 w-4" />
      </button>

      {menu && menu !== "type" && (
        <div className="relative z-40 mt-3 w-full border border-neutral-300 bg-white p-3 shadow-[var(--shadow-2)]">
          {content}
          {clearable && (
            <button onClick={clearMenu} className="mt-2 text-xs font-bold text-neutral-500 hover:text-brand-600">
              Remove this filter
            </button>
          )}
        </div>
      )}
      {menu === "type" && <div className="relative z-40 mt-3 w-full border border-neutral-300 bg-white p-3 shadow-[var(--shadow-2)]">{content}</div>}

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-neutral-500">Refine your search</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip label="Price" value={priceLabel} active={filters.priceMin != null || filters.priceMax != null} onClick={() => setMenu(menu === "price" ? null : "price")} />
        <Chip label="Bedrooms" value={bedroomsLabel} active={filters.bedrooms != null} onClick={() => setMenu(menu === "bedrooms" ? null : "bedrooms")} />
        <Chip label="Bathrooms" value={bathroomsLabel} active={filters.bathrooms != null} onClick={() => setMenu(menu === "bathrooms" ? null : "bathrooms")} />
        <Chip label="Area (m²)" value={areaLabel} active={filters.areaMin != null || filters.areaMax != null} onClick={() => setMenu(menu === "area" ? null : "area")} />
      </div>

      <button
        onClick={() => setMenu(menu === "more" ? null : "more")}
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-2 border px-3 py-2 text-sm font-semibold transition-all duration-150 ease-[var(--ease-rz)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-1)]",
          filters.premiumOnly ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-200 text-neutral-600 hover:border-brand-300"
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t("filters.moreFilters")}
      </button>

      <button
        onClick={onSubmit}
        className="group mt-4 flex w-full items-center justify-center gap-2 bg-accent px-9 py-3 text-sm font-extrabold uppercase tracking-[0.08em] text-neutral-900 transition-all duration-150 ease-[var(--ease-rz)] hover:-translate-y-0.5 hover:bg-accent-600 hover:shadow-[var(--shadow-2)] active:translate-y-0"
      >
        View properties
        <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
      </button>
    </div>
  );
}
