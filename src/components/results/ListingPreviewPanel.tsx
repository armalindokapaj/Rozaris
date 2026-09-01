"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BedDouble, Bath, MapPin, Ruler } from "lucide-react";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { formatArea } from "@/lib/utils";
import { getNeighborhood } from "@/lib/mockData";
import type { Listing } from "@/lib/types";

export function ListingPreviewPanel({ listing, onBack }: { listing: Listing; onBack: () => void }) {
  const priceFmt = usePriceFormat();
  const { t, locale } = useT();
  const neighborhood = getNeighborhood(listing.neighborhoodId);
  const description = listing.description[locale] ?? listing.description.en;
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white scroll-thin">
      <div className="sticky top-0 z-10 flex items-center border-b border-neutral-200 bg-white px-5 py-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-neutral-800 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back to search map
        </button>
      </div>
      <div className="p-5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-600">{listing.fromProjectName ?? listing.propertyType}</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight text-neutral-900">{listing.title}</h2>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-500"><MapPin className="h-4 w-4" />{neighborhood?.name}, {listing.city}</p>
        <p className="font-numeric mt-4 text-3xl font-bold text-neutral-900">{priceFmt(listing.price)}{listing.transaction === "rent" && <span className="ml-1 text-base font-medium text-neutral-500">{listing.rentSubtype === "daily" ? t("results.perNight") : t("results.perMonth")}</span>}</p>
        <div className="mt-5 aspect-[16/10] overflow-hidden bg-neutral-100">
          <PlaceholderImage seed={listing.id} kind="interior" className="h-full w-full" watermark />
        </div>
        <div className="mt-5 grid grid-cols-3 border-y border-neutral-200 py-4 text-center text-sm text-neutral-700">
          <span className="flex flex-col items-center gap-1"><BedDouble className="h-4 w-4" />{listing.bedrooms} {t("results.bedAbbrev")}</span>
          <span className="flex flex-col items-center gap-1 border-x border-neutral-200"><Bath className="h-4 w-4" />{listing.bathrooms} {t("results.bathAbbrev")}</span>
          <span className="flex flex-col items-center gap-1"><Ruler className="h-4 w-4" />{formatArea(listing.area)}</span>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-neutral-600">{description}</p>
        <Link href={`/listing/${listing.slug}`} className="mt-6 flex h-12 items-center justify-center gap-2 bg-neutral-900 text-sm font-bold text-white hover:bg-neutral-800">{t("results.viewDetails")} <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}
