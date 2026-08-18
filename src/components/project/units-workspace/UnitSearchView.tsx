"use client";

import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ChevronDown, Heart, LayoutGrid, Rows3, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn, formatPrice } from "@/lib/utils";
import type { Currency, Unit } from "@/lib/types";
import type { AreaUnit } from "@/hooks/useViewerPreferences";
import { convertUnitPrice, formatUnitArea } from "./unitDisplay";
import {
  activeFilterCount,
  BEDROOM_OPTIONS,
  bedroomLabel,
  DEFAULT_UNIT_FILTERS,
  filterUnits,
  sortUnits,
  type SortOption,
  type StatusFilter,
  type UnitFilterState,
} from "./unitFilters";

const STATUS_PILLS: { id: StatusFilter; dotClass?: string }[] = [
  { id: "available" },
  { id: "reserved", dotClass: "bg-amber-400" },
  { id: "sold", dotClass: "bg-red-400" },
  { id: "all" },
];
export const UNITS_PAGE_SIZE = 30;

const STATUS_DOT: Record<Unit["status"], string> = {
  available: "bg-emerald-400",
  reserved: "bg-amber-400",
  sold: "bg-red-400",
};

/** Small hand-rolled dropdown, same pattern as ViewerUtilities/SunTime's
 * date menu (useState+ref+useClickOutside — this codebase's react-hooks/
 * refs lint rule rejects the shared `useDropdown` hook, see those
 * components' own doc comments). */
function FilterDropdown({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-8 items-center gap-1 rounded-control border px-2.5 text-xs font-medium transition-colors",
          active ? "border-brand-400/60 bg-brand-500/15 text-white" : "border-white/10 bg-white/5 text-white/70 hover:text-white"
        )}
      >
        {label}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" className="viewer-glass absolute left-0 top-[calc(100%+6px)] z-20 w-56 rounded-panel p-3">
          {children}
        </div>
      )}
    </div>
  );
}

function NumberField({ placeholder, value, onChange }: { placeholder: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="h-8 w-full rounded-control border border-white/15 bg-white/5 px-2 text-xs text-white placeholder:text-white/30"
    />
  );
}

/**
 * Units Search Mode PRD, Phase 2 (2026-08-16) — real search/filter/sort/
 * list UI, now over real Postgres units (Phase 3 swapped off this
 * session's original "placeholder data first" mock inventory). Renders
 * inside
 * UnitsWorkspace's fixed 380px panel; Phase 3 (3D↔list hover/select sync)
 * and Phase 4 (this view swapping to UnitDetailView on row click, now
 * built alongside this) both build on `onSelectUnit` below.
 *
 * Deliberate simplifications from the reference render: Price/Floor use
 * plain min/max number fields inside a dropdown rather than a dual-thumb
 * slider (RangeSlider.tsx exists but is tuned for the public Search
 * page's own domain-specific scales; a real listing-price slider here
 * would need its own scale tuned to this project's actual price spread,
 * which doesn't exist for mock data) — real, functioning range filtering,
 * simpler control. "Advanced filters" has no real content behind it yet
 * (bathrooms/transaction-type aren't part of this render's own spec) so
 * it's an inert affordance, same honesty pattern as ViewerModuleLayer's
 * "coming soon" placeholders elsewhere in this file tree.
 *
 * `filters`/`viewMode`/`visibleCount` are controlled by the parent, not
 * owned here — a real bug found live-testing: clicking into a unit's
 * detail view unmounts this component (Unit Detail PRD §1's "same panel,
 * never a second one" swap), so state that lived here as plain `useState`
 * reset the moment you clicked "Back to search". Same fix as favorites
 * already got. `filters` itself moved one level further up, from
 * UnitsWorkspace to ProjectViewerRuntime, for the Units Bar redesign
 * (2026-08-17) — UnitsBar is a sibling of UnitsWorkspace (both live under
 * ViewerHUD's parent), not its child, and needs to read/write the exact
 * same state so its Bedrooms/Bathrooms/Surface/Availability controls
 * genuinely narrow this same list rather than a disconnected copy.
 * Bathrooms/Surface have no control of their own in *this* panel yet
 * (still true of "Advanced filters" below), but the state itself is real
 * and shared, so filtering set from UnitsBar is reflected here too.
 */
export function UnitSearchView({
  units,
  favorites,
  onToggleFavorite,
  onSelectUnit,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  visibleCount,
  onVisibleCountChange,
  displayCurrency,
  eurToAllRate,
  areaUnit,
}: {
  units: Unit[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onSelectUnit: (unit: Unit) => void;
  filters: UnitFilterState;
  onFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
  viewMode: "list" | "grid";
  onViewModeChange: Dispatch<SetStateAction<"list" | "grid">>;
  visibleCount: number;
  onVisibleCountChange: Dispatch<SetStateAction<number>>;
  displayCurrency: Currency;
  eurToAllRate: number;
  areaUnit: AreaUnit;
}) {
  const { t } = useT();

  const filtered = useMemo(() => sortUnits(filterUnits(units, filters), filters.sort), [units, filters]);
  const visible = filtered.slice(0, visibleCount);
  const filterCount = activeFilterCount(filters);
  const buildings = useMemo(() => Array.from(new Set(units.map((u) => u.buildingName))).sort(), [units]);

  function update(patch: Partial<UnitFilterState>) {
    onFiltersChange((prev) => ({ ...prev, ...patch }));
    onVisibleCountChange(UNITS_PAGE_SIZE);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-white/10 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" aria-hidden="true" />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder={t("units.searchPlaceholder")}
            className="h-9 w-full rounded-control border border-white/10 bg-white/5 pl-8 pr-2 text-sm text-white placeholder:text-white/35"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_PILLS.map(({ id, dotClass }) => (
            <button
              key={id}
              type="button"
              onClick={() => update({ status: id })}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-xs font-medium transition-colors",
                filters.status === id ? "bg-brand-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {dotClass && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden="true" />}
              {t(`units.status.${id}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {BEDROOM_OPTIONS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => update({ bedrooms: filters.bedrooms === b ? null : b })}
              className={cn(
                "flex h-7 items-center rounded-pill px-2.5 text-xs font-medium transition-colors",
                filters.bedrooms === b ? "bg-brand-500 text-white" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {bedroomLabel(b)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterDropdown label={t("units.filterPrice")} active={filters.minPrice != null || filters.maxPrice != null}>
            <div className="flex items-center gap-2">
              <NumberField placeholder={t("units.min")} value={filters.minPrice} onChange={(v) => update({ minPrice: v })} />
              <NumberField placeholder={t("units.max")} value={filters.maxPrice} onChange={(v) => update({ maxPrice: v })} />
            </div>
          </FilterDropdown>
          <FilterDropdown label={t("units.filterFloor")} active={filters.minFloor != null || filters.maxFloor != null}>
            <div className="flex items-center gap-2">
              <NumberField placeholder={t("units.min")} value={filters.minFloor} onChange={(v) => update({ minFloor: v })} />
              <NumberField placeholder={t("units.max")} value={filters.maxFloor} onChange={(v) => update({ maxFloor: v })} />
            </div>
          </FilterDropdown>
          <FilterDropdown label={t("units.filterBuilding")} active={filters.building != null}>
            <div className="space-y-0.5">
              {buildings.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => update({ building: filters.building === b ? null : b })}
                  className={cn(
                    "flex w-full items-center justify-between rounded-control px-2 py-1.5 text-left text-xs",
                    filters.building === b ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </FilterDropdown>
        </div>

        <div className="flex items-center justify-between pt-0.5 text-xs">
          <span className="cursor-default text-white/30" title={t("units.moreComingSoon")}>
            {t("units.advancedFilters")}
          </span>
          {filterCount > 0 && (
            <button
              type="button"
              onClick={() => onFiltersChange(DEFAULT_UNIT_FILTERS)}
              className="flex items-center gap-1 font-medium text-brand-400 hover:text-brand-300"
            >
              {t("units.clearFilters")} <span className="tabular-nums">({filterCount})</span>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs text-white/50">{t("units.resultsCount", { count: filtered.length })}</span>
        <div className="flex items-center gap-2">
          <select
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as SortOption })}
            className="h-7 rounded-control border border-white/10 bg-white/5 px-1.5 text-xs text-white/70"
          >
            {(["recommended", "priceAsc", "priceDesc", "areaAsc", "areaDesc", "floorAsc", "floorDesc"] as SortOption[]).map((opt) => (
              <option key={opt} value={opt} className="bg-neutral-900">
                {t(`units.sort.${opt}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onViewModeChange((m) => (m === "list" ? "grid" : "list"))}
            aria-label={t(viewMode === "list" ? "units.viewGrid" : "units.viewList")}
            title={t(viewMode === "list" ? "units.viewGrid" : "units.viewList")}
            className="flex h-7 w-7 items-center justify-center rounded-control text-white/60 hover:bg-white/10 hover:text-white"
          >
            {viewMode === "list" ? <LayoutGrid className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {visible.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-white/40">{t("units.noResults")}</p>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-2 gap-2" : "space-y-1.5"}>
            {visible.map((unit) => (
              <button
                key={unit.id}
                type="button"
                onClick={() => onSelectUnit(unit)}
                className="w-full rounded-control border border-white/5 bg-white/[0.03] p-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{unit.code}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-semibold text-white">
                      {formatPrice(convertUnitPrice(unit.price, unit.currency, displayCurrency, eurToAllRate), displayCurrency)}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(unit.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleFavorite(unit.id);
                        }
                      }}
                      aria-label={t("units.favorite")}
                      aria-pressed={favorites.has(unit.id)}
                      className="text-white/40 hover:text-white"
                    >
                      <Heart className={cn("h-3.5 w-3.5", favorites.has(unit.id) && "fill-brand-400 text-brand-400")} />
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-white/50">
                  <span>
                    {t("units.floorLabel", { floor: unit.floor })} · {bedroomLabel(unit.bedrooms)} · {formatUnitArea(unit.area, areaUnit)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[unit.status])} aria-hidden="true" />
                    {t(`units.status.${unit.status}`)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-4 py-2.5 text-xs text-white/50">
        <span>{t("units.showingRange", { shown: visible.length, total: filtered.length })}</span>
        {visibleCount < filtered.length && (
          <button
            type="button"
            onClick={() => onVisibleCountChange((c) => c + UNITS_PAGE_SIZE)}
            className="font-medium text-brand-400 hover:text-brand-300"
          >
            {t("units.loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}
