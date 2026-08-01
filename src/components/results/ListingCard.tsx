"use client";

import Link from "next/link";
import { BedDouble, Bath, Ruler, Heart, SquareStack, Check } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useAppStore } from "@/lib/store";
import { formatArea, formatPrice, transactionLabel, cn } from "@/lib/utils";
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

  return (
    <Link
      href={`/listing/${listing.slug}`}
      onMouseEnter={() => setHovered(listing.id)}
      onMouseLeave={() => setHovered(null)}
      onClick={() => {
        selectListing(listing.id);
        requestFlyTo({ lat: listing.coords.lat, lng: listing.coords.lng, zoom: 16 });
      }}
      className={cn(
        "group block overflow-hidden rounded-card border bg-white shadow-sm transition-all",
        isActive
          ? "border-brand-400 shadow-lg ring-1 ring-brand-200"
          : "border-neutral-200 hover:border-neutral-300 hover:shadow-md",
        variant === "grid" ? "flex flex-col" : "flex flex-col"
      )}
    >
      <div className="relative aspect-[4/3] w-full">
        <PlaceholderImage seed={listing.id} kind="interior" className="h-full w-full" />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {listing.premium && (
            <span className="rounded-full bg-listing-premium px-2 py-1 text-[11px] font-semibold text-white shadow">
              Premium
            </span>
          )}
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow",
              listing.transaction === "sale" && "bg-sale",
              listing.transaction === "rent" && "bg-rent",
              listing.transaction === "coming_soon" && "bg-coming-soon"
            )}
          >
            {transactionLabel(listing.transaction, listing.rentSubtype)}
          </span>
        </div>
        <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!auth.signedIn) return;
              toggleSaved(listing.id);
            }}
            aria-label={saved ? "Remove from saved" : "Save listing"}
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
            aria-label={inCompare ? "Remove from compare" : "Add to compare"}
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
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="text-[15px] font-semibold text-neutral-900">
          {formatPrice(listing.price, listing.currency)}
          {listing.transaction === "rent" && (
            <span className="text-xs font-normal text-neutral-500">
              {listing.rentSubtype === "daily" ? "/night" : "/mo"}
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
      </div>
    </Link>
  );
}
