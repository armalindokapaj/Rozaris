"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { gsap } from "gsap";
import { Building2, ChevronDown, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { clamp, cn } from "@/lib/utils";
import { formatUnitArea } from "./unitDisplay";
import { bedroomLabel, filterUnits, unitFacets, type StatusFilter, type UnitFilterState } from "./unitFilters";
import type { Unit } from "@/lib/types";
import type { ActiveModule } from "../viewer-hud/types";

const AVAILABILITY_PILLS: StatusFilter[] = ["available", "reserved", "sold"];

function MobileFilterSelect({
  label,
  value,
  options,
  formatOption,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  formatOption: (v: number) => string;
  onChange: (v: number | null) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value == null ? t("common.any") : formatOption(value)}`}
        className="flex h-11 items-center justify-between rounded-control border border-white/15 bg-white/5 px-3 text-sm font-medium text-white"
      >
        {value == null ? t("common.any") : formatOption(value)}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="viewer-glass absolute top-[calc(100%+6px)] left-0 right-0 z-10 rounded-panel p-1.5">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded-control px-3 py-2 text-left text-sm font-medium transition-colors",
              value == null ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            {t("common.any")}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-control px-3 py-2 text-left text-sm font-medium transition-colors",
                value === opt ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {formatOption(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactFilterSelect({
  label,
  value,
  options,
  formatOption,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  formatOption: (v: number) => string;
  onChange: (v: number | null) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative flex shrink-0 flex-col justify-center gap-1 px-3.5 sm:px-4">
      <span className="whitespace-nowrap text-[11px] text-white/50">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value == null ? t("common.any") : formatOption(value)}`}
        className="flex items-center gap-1.5 text-sm font-medium text-white"
      >
        {value == null ? t("common.any") : formatOption(value)}
        <ChevronDown className={cn("h-3.5 w-3.5 text-white/50 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="viewer-glass absolute bottom-[calc(100%+8px)] left-0 z-10 w-32 rounded-panel p-1.5">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded-control px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              value == null ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            {t("common.any")}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-control px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                value === opt ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {formatOption(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UnitsBar({
  activeModule,
  isDesktop,
  units,
  filters,
  onFiltersChange,
  listOpen,
  onToggleList,
  onClose,
}: {
  activeModule: ActiveModule;
  isDesktop: boolean;
  units: Unit[];
  filters: UnitFilterState;
  onFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
  listOpen: boolean;
  onToggleList: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const { areaUnit } = useViewerPreferences();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activeModule === "units";

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      y: open ? 0 : 12,
      duration: reducedMotion ? 0 : 0.3,
      ease: "power2.out",
    });
  }, [open, reducedMotion, isDesktop]);

  const filteredCount = useMemo(() => filterUnits(units, filters).length, [units, filters]);

  const areaBounds = useMemo(() => {
    if (units.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const u of units) {
      if (u.area < min) min = u.area;
      if (u.area > max) max = u.area;
    }
    return min < max ? { min: Math.floor(min), max: Math.ceil(max) } : null;
  }, [units]);

  const facets = useMemo(() => unitFacets(units, filters), [units, filters]);

  const effMin = areaBounds ? clamp(filters.minArea ?? areaBounds.min, areaBounds.min, areaBounds.max) : 0;
  const effMax = areaBounds ? clamp(filters.maxArea ?? areaBounds.max, areaBounds.min, areaBounds.max) : 0;
  const areaGap = areaBounds ? Math.max(1, Math.round((areaBounds.max - areaBounds.min) * 0.02)) : 1;

  function handleMinAreaChange(e: ChangeEvent<HTMLInputElement>) {
    if (!areaBounds) return;
    const raw = clamp(Number(e.target.value), areaBounds.min, effMax - areaGap);
    onFiltersChange((prev) => ({ ...prev, minArea: raw <= areaBounds.min ? null : raw }));
  }
  function handleMaxAreaChange(e: ChangeEvent<HTMLInputElement>) {
    if (!areaBounds) return;
    const raw = clamp(Number(e.target.value), effMin + areaGap, areaBounds.max);
    onFiltersChange((prev) => ({ ...prev, maxArea: raw >= areaBounds.max ? null : raw }));
  }

  const fillLeftPct = areaBounds ? ((effMin - areaBounds.min) / (areaBounds.max - areaBounds.min)) * 100 : 0;
  const fillRightPct = areaBounds ? 100 - ((effMax - areaBounds.min) / (areaBounds.max - areaBounds.min)) * 100 : 0;
  const minThumbOnTop = areaBounds ? (effMin - areaBounds.min) / (areaBounds.max - areaBounds.min) > 0.5 : false;

  const surfaceSlider = areaBounds ? (
    <div className="relative flex h-6 items-center">
      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/10" />
      <div
        className="pointer-events-none absolute h-1.5 rounded-full bg-brand-400"
        style={{ left: `${fillLeftPct}%`, right: `${fillRightPct}%` }}
      />
      <input
        type="range"
        min={areaBounds.min}
        max={areaBounds.max}
        value={effMin}
        onChange={handleMinAreaChange}
        aria-label={`${t("units.filterSurface")} minimum`}
        className="rz-range-thumb"
        style={{ zIndex: minThumbOnTop ? 5 : 3 }}
      />
      <input
        type="range"
        min={areaBounds.min}
        max={areaBounds.max}
        value={effMax}
        onChange={handleMaxAreaChange}
        aria-label={`${t("units.filterSurface")} maximum`}
        className="rz-range-thumb"
        style={{ zIndex: minThumbOnTop ? 3 : 4 }}
      />
    </div>
  ) : (
    <div className="flex h-6 items-center" aria-hidden="true">
      <div className="h-1.5 w-full rounded-full bg-white/10" />
    </div>
  );

  const availabilityPills = (extraClassName: string) => (
    <div className={extraClassName}>
      {AVAILABILITY_PILLS.map((id) => {
        const isActive = filters.status === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onFiltersChange((prev) => ({ ...prev, status: id }))}
            aria-pressed={isActive}
            className={cn(
              "whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors",
              isActive ? "bg-brand-500 text-white" : "border border-white/15 text-white/75 hover:border-white/25 hover:text-white"
            )}
          >
            {t(`units.status.${id}`)}
          </button>
        );
      })}
    </div>
  );

  if (!isDesktop) {
    return (
      <div
        ref={panelRef}
        role="group"
        aria-label={t("units.title")}
        aria-hidden={!open}
        className={cn(
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel px-4 pb-4 pt-2.5 opacity-0",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {                                                              
                           }
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />

        <div>
          <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterSurface")}</span>
          {surfaceSlider}
          <div className="flex items-center justify-between text-sm font-semibold tabular-nums text-white">
            <span>{areaBounds ? formatUnitArea(effMin, areaUnit) : "—"}</span>
            <span>{areaBounds ? formatUnitArea(effMax, areaUnit) : "—"}</span>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <MobileFilterSelect
            label={t("units.filterBedrooms")}
            value={filters.bedrooms}
            options={facets.bedrooms}
            formatOption={bedroomLabel}
            onChange={(v) => onFiltersChange((prev) => ({ ...prev, bedrooms: v }))}
          />
          <MobileFilterSelect
            label={t("units.filterBathrooms")}
            value={filters.bathrooms}
            options={facets.bathrooms}
            formatOption={(v) => String(v)}
            onChange={(v) => onFiltersChange((prev) => ({ ...prev, bathrooms: v }))}
          />
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterAvailability")}</span>
          {availabilityPills("flex items-stretch gap-2 [&>button]:flex-1 [&>button]:justify-center")}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("units.title")}
      aria-hidden={!open}
      className={cn(
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex min-h-[104px] w-[916px] max-w-[calc(100vw-2rem)] -translate-x-1/2 items-stretch rounded-panel px-3.5 opacity-0 ring-2 ring-brand-400/50 sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {                                                                
                                                                    }
      <button
        type="button"
        onClick={onToggleList}
        aria-pressed={listOpen}
        aria-label={t("units.listUnits")}
        title={t("units.listUnits")}
        className={cn(
          "flex shrink-0 items-center gap-2.5 rounded-control pr-3.5 transition-colors sm:pr-4",
          listOpen ? "text-brand-400" : "text-white hover:text-brand-300"
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 transition-colors",
            listOpen ? "bg-brand-500/25 ring-brand-400" : "bg-brand-500/15 ring-brand-400/50"
          )}
        >
          <Building2 className="h-4 w-4 text-brand-400" aria-hidden="true" />
        </span>
        <span className="flex flex-col items-start gap-0.5 leading-none">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            {                                                         
                        }
            <span className="text-sm font-bold text-white">{t("units.filterListLabel")}</span>
            <span className="text-xs font-normal text-white/50">{t("units.foundCount", { count: filteredCount })}</span>
          </span>
          <span className="whitespace-nowrap text-[11px] font-normal normal-case text-white/50">{t("units.refineSubtitle")}</span>
        </span>
      </button>

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {                                                                    
                      }
      <div className="flex w-52 shrink-0 flex-col justify-center gap-1 px-3.5 sm:px-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="whitespace-nowrap text-[11px] text-white/50">{t("units.filterSurface")}</span>
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-white">
            {areaBounds ? `${formatUnitArea(effMin, areaUnit)} – ${formatUnitArea(effMax, areaUnit)}` : "—"}
          </span>
        </div>
        {areaBounds ? (
          <div className="relative flex h-5 items-center">
            <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/10" />
            <div
              className="pointer-events-none absolute h-1.5 rounded-full bg-brand-400"
              style={{ left: `${fillLeftPct}%`, right: `${fillRightPct}%` }}
            />
            <input
              type="range"
              min={areaBounds.min}
              max={areaBounds.max}
              value={effMin}
              onChange={handleMinAreaChange}
              aria-label={`${t("units.filterSurface")} minimum`}
              className="rz-range-thumb"
              style={{ zIndex: minThumbOnTop ? 5 : 3 }}
            />
            <input
              type="range"
              min={areaBounds.min}
              max={areaBounds.max}
              value={effMax}
              onChange={handleMaxAreaChange}
              aria-label={`${t("units.filterSurface")} maximum`}
              className="rz-range-thumb"
              style={{ zIndex: minThumbOnTop ? 3 : 4 }}
            />
          </div>
        ) : (
          <div className="flex h-5 items-center" aria-hidden="true">
            <div className="h-1.5 w-full rounded-full bg-white/10" />
          </div>
        )}
      </div>

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      <CompactFilterSelect
        label={t("units.filterBedrooms")}
        value={filters.bedrooms}
        options={facets.bedrooms}
        formatOption={bedroomLabel}
        onChange={(v) => onFiltersChange((prev) => ({ ...prev, bedrooms: v }))}
      />

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      <CompactFilterSelect
        label={t("units.filterBathrooms")}
        value={filters.bathrooms}
        options={facets.bathrooms}
        formatOption={(v) => String(v)}
        onChange={(v) => onFiltersChange((prev) => ({ ...prev, bathrooms: v }))}
      />

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {                                                        
                                                                         }
      <div className="flex shrink-0 items-center pl-3.5 sm:pl-4">{availabilityPills("flex items-center gap-1.5")}</div>

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {                                                                
                                         }
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="flex shrink-0 items-center pl-3.5 text-white/50 transition-colors hover:text-white sm:pl-4"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
