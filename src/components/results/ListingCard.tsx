"use client";

import Link from "next/link";
import { BedDouble, Bath, Ruler, Heart, SquareStack, Check, ArrowRight } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { formatArea, transactionLabel, cn } from "@/lib/utils";
import { getNeighborhood } from "@/lib/mockData";
import type { Listing } from "@/lib/types";

export function ListingCard({
  listing,
  variant = "panel",
}: {
  listing: Listing;
  variant?: "panel" | "grid";
}) {
  const neighborhood = getNeighborhood(listing.neighborhoodId);
  const priceFmt = usePriceFormat();
  const { t, locale } = useT();
  const selectedListingId = useAppStore((s) => s.selectedListingId);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const setHovered = useAppStore((s) => s.setHovered);
  const selectListing = useAppStore((s) => s.selectListing);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);
  const saved = useAppStore((s) => s.saved.listings.includes(listing.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedListing);
  const auth = useAppStore((s) => s.auth);
  const compare = useAppStore((s) => s.compare);
  const addCompare = useAppStore((s) => s.addCompare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);
  const compareIndex = compare.findIndex(
    (c) => c.kind === "listing" && c.entity.id === listing.id
  );
  const inCompare = compareIndex !== -1;

  const isActive = selectedListingId === listing.id || hoveredId === listing.id;
  // First click centers this listing on the map and reveals "View Unit" —
  // it does not navigate. Only a second, explicit click on "View Unit"
  // (a real Link, so it still works with ctrl/cmd-click and middle-click)
  // goes to the detail page.
  const isSelected = selectedListingId === listing.id;

  function selectOnMap() {
    selectListing(listing.id);
    requestFlyTo({ lat: listing.coords.lat, lng: listing.coords.lng, zoom: 16 });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-variant={variant}
      onMouseEnter={() => setHovered(listing.id)}
      onMouseLeave={() => setHovered(null)}
      onClick={selectOnMap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectOnMap();
        }
      }}
      className={cn(
        "group block rounded-card border shadow-sm transition-all",
        listing.premium ? "bg-amber-50/70" : "bg-white",
        isActive
          ? "border-brand-400 shadow-lg ring-1 ring-brand-200"
          : listing.premium
          ? "border-listing-premium/50"
          : "border-neutral-200 hover:border-neutral-300 hover:shadow-md",
        // Applied whenever premium, not only in the non-active branch above —
        // otherwise hovering the card sets hoveredId (for map-marker sync),
        // which flips isActive and would silently swallow the zoom effect.
        listing.premium && "hover:z-10 hover:scale-[1.02] hover:border-listing-premium hover:shadow-lg",
        // Horizontal on small screens so more results fit per scroll — same
        // row spec (inset image, p-4/gap-4) as New Projects' ProjectListRow
        // on desktop — then back to a stacked, flush-image card at lg+
        // (grid variant is always a stacked, flush-image card).
        variant === "panel"
          ? "flex flex-row gap-4 overflow-visible p-4 lg:flex-col lg:gap-0 lg:overflow-hidden lg:p-0"
          : "flex flex-col overflow-hidden"
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-card",
          variant === "panel"
            ? "w-52 lg:w-full lg:aspect-[4/3] lg:rounded-none"
            : "aspect-[4/3] w-full rounded-none"
        )}
      >
        <PlaceholderImage seed={listing.id} kind="interior" className="h-full w-full" />
        {variant !== "grid" && (
          <div className="absolute left-2.5 top-2.5 flex gap-1.5">
            {/* No "Premium" text badge on the card itself — premium status
                reads through the amber tint/border and hover treatment only. */}
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow",
                listing.transaction === "sale" && "bg-sale",
                listing.transaction === "rent" && "bg-rent",
                listing.transaction === "coming_soon" && "bg-coming-soon"
              )}
            >
              {transactionLabel(listing.transaction, listing.rentSubtype, locale)}
            </span>
          </div>
        )}
        <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!auth.signedIn) return;
              toggleSaved(listing.id);
            }}
            aria-label={saved ? t("results.removeFromSaved") : t("results.saveListing")}
            aria-pressed={saved}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow hover:text-red-500"
          >
            <Heart className={cn("h-4 w-4", saved && "fill-red-500 text-red-500")} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (inCompare) removeCompareAt(compareIndex);
              else addCompare({ kind: "listing", entity: listing });
            }}
            aria-label={inCompare ? t("results.removeFromCompare") : t("results.addToCompare")}
            aria-pressed={inCompare}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full shadow",
              inCompare ? "bg-brand-500 text-white" : "bg-white/90 text-neutral-600 hover:text-brand-600"
            )}
          >
            {inCompare ? (
              <Check className="h-4 w-4" />
            ) : (
              <SquareStack className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1",
          variant === "panel" ? "lg:gap-1.5 lg:p-3.5" : "gap-1.5 p-3.5"
        )}
      >
        <p className="text-[15px] font-semibold text-neutral-900">
          {priceFmt(listing.price)}
          {listing.transaction === "rent" && (
            <span className="text-xs font-normal text-neutral-500">
              {listing.rentSubtype === "daily" ? t("results.perNight") : t("results.perMonth")}
            </span>
          )}
        </p>
        <p className="truncate text-sm font-medium text-neutral-800">{listing.title}</p>
        <p className="truncate text-xs text-neutral-500">
          {neighborhood?.name}, {listing.city}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
          {listing.bedrooms > 0 && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" /> {listing.bedrooms}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" /> {listing.bathrooms}
          </span>
          <span className="flex items-center gap-1">
            <Ruler className="h-3.5 w-3.5" /> {formatArea(listing.area)}
          </span>
        </div>

        {isSelected && (
          <Link
            href={`/listing/${listing.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {t("results.viewUnit")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
