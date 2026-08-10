"use client";

import { X } from "lucide-react";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import type { Listing } from "@/lib/types";

/** MAP-016: a building with multiple independent listings shows an aggregate popup. */
export function BuildingPopupCard({
  listing,
  siblingCount,
  onClose,
  onViewListing,
  style,
}: {
  listing: Listing;
  siblingCount: number;
  onClose: () => void;
  onViewListing: () => void;
  style?: React.CSSProperties;
}) {
  const priceFmt = usePriceFormat();
  const { t } = useT();
  return (
    <div
      className="absolute z-40 w-64 -translate-x-1/2 -translate-y-[calc(100%+16px)] overflow-hidden rounded-card border border-neutral-200 bg-white p-4 shadow-[var(--shadow-2)]"
      style={style}
      role="dialog"
      aria-label={t("map.buildingListingsAria")}
    >
      <button
        onClick={onClose}
        aria-label={t("map.closePopup")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="pr-6 text-sm font-semibold text-neutral-900">
        {t("map.buildingListingsCount", { count: siblingCount })}
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        {t("map.from")}{" "}
        <span className="font-semibold text-neutral-900">
          {priceFmt(listing.price, { compact: true })}
        </span>
      </p>
      <button
        onClick={onViewListing}
        className="mt-3 w-full rounded-control bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        {t("map.viewListings")}
      </button>
    </div>
  );
}
