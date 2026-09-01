"use client";

import Link from "next/link";
import { Heart, SquareStack, Check, ArrowRight } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { formatArea, transactionLabel, cn } from "@/lib/utils";
import { getNeighborhood } from "@/lib/mockData";
import { SELECTED_UNIT_ZOOM } from "@/lib/constants";
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
  const isSelected = selectedListingId === listing.id;

  function selectOnMap() {
    selectListing(listing.id);
    requestFlyTo({ lat: listing.coords.lat, lng: listing.coords.lng, zoom: SELECTED_UNIT_ZOOM });
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
        "group block border transition-colors",
        listing.premium ? "bg-amber-50/70" : "bg-white",
        isActive
          ? "border-brand-400 shadow-[var(--shadow-1)]"
          : listing.premium
          ? "border-listing-premium/50"
          : "border-neutral-200 hover:border-neutral-300",
        listing.premium && "hover:z-10 hover:border-listing-premium hover:shadow-[var(--shadow-1)]",
        variant === "panel"
          ? "flex flex-row gap-4 overflow-visible p-4 lg:flex-col lg:gap-0 lg:overflow-hidden lg:p-0"
          : "flex flex-col overflow-hidden"
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden",
          variant === "panel"
            ? "w-52 lg:w-full lg:aspect-[4/3] lg:rounded-none"
            : "aspect-[16/9] w-full rounded-none"
        )}
      >
        <PlaceholderImage seed={listing.id} kind="interior" className="h-full w-full" watermark />
        {variant !== "grid" && (
          <div className="absolute left-2.5 top-2.5 flex gap-1.5">
            {                                                              
                                                                                }
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
        <div className={cn("absolute flex gap-1.5", variant === "grid" ? "bottom-3 right-3" : "right-2.5 top-2.5 flex-col")}>
          {variant !== "grid" && <button
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
          </button>}
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
          variant === "panel" ? "lg:gap-1.5 lg:p-3.5" : "gap-1 p-3"
        )}
      >
        {variant === "grid" && <p className="truncate text-xs font-medium text-neutral-500">{listing.publisher.name}</p>}
        <p className={cn("truncate text-neutral-900", variant === "grid" ? "font-serif text-lg leading-tight" : "font-serif text-base")}>{listing.title}</p>
        <p className="truncate text-sm text-neutral-500">{neighborhood?.name}, {listing.city}</p>
        <p className={cn("font-numeric font-bold text-brand-600", variant === "grid" ? "text-xl leading-tight" : "text-[15px] text-neutral-900")}>
          {priceFmt(listing.price)}
          {listing.transaction === "rent" && (
            <span className="ml-1 text-xs font-normal text-neutral-500">
              {listing.rentSubtype === "daily" ? t("results.perNight") : t("results.perMonth")}
            </span>
          )}
        </p>
        {variant !== "grid" && <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
          {[
            listing.bedrooms > 0 ? `${listing.bedrooms} ${t("results.bedAbbrev")}` : null,
            `${listing.bathrooms} ${t("results.bathAbbrev")}`,
            formatArea(listing.area),
            listing.floor != null ? t("results.floorNum", { floor: listing.floor }) : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>}

        {variant !== "grid" && (isSelected ? (
          <Link
            href={`/listing/${listing.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-control bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
          >
            {t("results.viewUnit")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link
            href={`/listing/${listing.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 flex items-center gap-1 border-t border-neutral-100 pt-2 text-xs font-semibold text-neutral-700 hover:text-brand-600"
          >
            {t("results.viewDetails")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
