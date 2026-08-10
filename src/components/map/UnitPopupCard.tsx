"use client";

import { X, ArrowRight } from "lucide-react";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import type { Listing } from "@/lib/types";

/**
 * Shown on the map when a unit belonging to a New Project is selected from
 * the results list — the project's own marker is the only pin plotted at
 * that location (MAP declutter), so this is the only way the map surfaces
 * *which specific unit* is selected, rather than just the project overview
 * (ProjectPopupCard) or a generic "N listings here" aggregate
 * (BuildingPopupCard, which is for unrelated listings sharing a building).
 */
export function UnitPopupCard({
  listing,
  onClose,
  onViewUnit,
  style,
}: {
  listing: Listing;
  onClose: () => void;
  onViewUnit: () => void;
  style?: React.CSSProperties;
}) {
  const priceFmt = usePriceFormat();
  const { t } = useT();
  return (
    <div
      className="absolute z-40 w-64 -translate-x-1/2 -translate-y-[calc(100%+16px)] overflow-hidden rounded-card border border-neutral-200 bg-white p-4 shadow-[var(--shadow-2)]"
      style={style}
      role="dialog"
      aria-label={listing.title}
    >
      <button
        onClick={onClose}
        aria-label={t("map.closePopup")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {listing.fromProjectName && (
        <p className="pr-6 truncate text-xs font-medium uppercase tracking-wide text-listing-new-dev">
          {listing.fromProjectName}
        </p>
      )}
      <p className="mt-0.5 truncate pr-6 text-sm font-semibold text-neutral-900">
        {priceFmt(listing.price, { compact: true })}
      </p>
      <p className="mt-0.5 truncate text-xs text-neutral-500">{listing.title}</p>
      <button
        onClick={onViewUnit}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        {t("results.viewUnit")}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
