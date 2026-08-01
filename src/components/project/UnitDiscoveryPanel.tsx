"use client";

import { useMemo, useState } from "react";
import { BedDouble, Bath, Ruler, X } from "lucide-react";
import type { Project, Unit } from "@/lib/types";
import { formatPrice, cn } from "@/lib/utils";

const STATUS_STYLE: Record<Unit["status"], string> = {
  available: "border-listing-standard text-listing-standard bg-blue-50",
  reserved: "border-listing-premium text-listing-premium bg-amber-50",
  sold: "border-neutral-300 text-neutral-400 bg-neutral-50",
};

export function UnitDiscoveryPanel({
  project,
  open,
  onClose,
  onSelectUnit,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  onSelectUnit: (unit: Unit) => void;
}) {
  const [building, setBuilding] = useState<string | "all">("all");
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [hideSold, setHideSold] = useState(true);

  const units = useMemo(() => {
    return project.units.filter((u) => {
      if (building !== "all" && u.buildingName !== building) return false;
      if (bedrooms !== null && u.bedrooms < bedrooms) return false;
      if (maxPrice !== null && u.price > maxPrice) return false;
      if (hideSold && u.status === "sold") return false;
      return true;
    });
  }, [project.units, building, bedrooms, maxPrice, hideSold]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-panel bg-white shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:top-0 lg:h-full lg:max-h-none lg:w-[420px] lg:rounded-l-panel lg:rounded-tr-none"
      role="dialog"
      aria-label="Explore available units"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Available units</h2>
          <p className="text-xs text-neutral-500">
            {units.length} of {project.units.length} units match
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close unit discovery"
          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 space-y-3 border-b border-neutral-100 p-4">
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={building === "all"} onClick={() => setBuilding("all")}>
            All buildings
          </FilterPill>
          {project.buildings.map((b) => (
            <FilterPill key={b} active={building === b} onClick={() => setBuilding(b)}>
              Building {b}
            </FilterPill>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[null, 1, 2, 3, 4].map((v) => (
            <FilterPill key={String(v)} active={bedrooms === v} onClick={() => setBedrooms(v)}>
              {v === null ? "Any beds" : `${v}+ bed`}
            </FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Max price (€)"
            value={maxPrice ?? ""}
            onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={hideSold}
              onChange={(e) => setHideSold(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-500"
            />
            Hide sold
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto scroll-thin p-4">
        {units.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-500">
            No units match these filters yet.
          </p>
        )}
        {units.map((unit) => (
          <button
            key={unit.id}
            onClick={() => onSelectUnit(unit)}
            disabled={unit.status === "sold"}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-card border p-3.5 text-left transition-colors",
              unit.status === "sold"
                ? "cursor-not-allowed border-neutral-100 opacity-60"
                : "border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40"
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-neutral-900">{unit.code}</p>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                    STATUS_STYLE[unit.status]
                  )}
                >
                  {unit.status}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <BedDouble className="h-3.5 w-3.5" /> {unit.bedrooms}
                </span>
                <span className="flex items-center gap-1">
                  <Bath className="h-3.5 w-3.5" /> {unit.bathrooms}
                </span>
                <span className="flex items-center gap-1">
                  <Ruler className="h-3.5 w-3.5" /> {unit.area} m²
                </span>
                <span>Floor {unit.floor}</span>
              </div>
            </div>
            <p className="shrink-0 text-sm font-bold text-neutral-900">
              {formatPrice(unit.price, unit.currency, { compact: true })}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPill({
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
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-pill border px-3 py-1.5 text-xs font-medium",
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-neutral-200 text-neutral-600 hover:border-neutral-300"
      )}
    >
      {children}
    </button>
  );
}
