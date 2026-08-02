"use client";

import Link from "next/link";
import {
  BedDouble,
  Bath,
  Ruler,
  Layers,
  Calendar,
  Heart,
  SquareStack,
  ShieldCheck,
  Box,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { getNeighborhood } from "@/lib/mockData";
import { Gallery } from "@/components/listing/Gallery";
import { PublisherCard } from "@/components/listing/PublisherCard";
import { ShareButton } from "@/components/listing/ShareButton";
import { AdBanner } from "@/components/listing/AdBanner";
import { MortgageCalculator } from "@/components/listing/MortgageCalculator";
import { InsuranceCalculator } from "@/components/listing/InsuranceCalculator";
import { StaticContextMap } from "@/components/map/StaticContextMap";
import { ListingCard } from "@/components/results/ListingCard";
import { AMENITY_LABELS, CONDITION_LABELS, PROPERTY_TYPE_LABELS, SITE_URL } from "@/lib/constants";
import {
  formatArea,
  formatRelativeDate,
  transactionLabel,
  cn,
} from "@/lib/utils";
import type { Listing } from "@/lib/types";

export function ListingDetailClient({
  listing,
  related,
}: {
  listing: Listing;
  related: Listing[];
}) {
  const neighborhood = getNeighborhood(listing.neighborhoodId);
  const auth = useAppStore((s) => s.auth);
  const saved = useAppStore((s) => s.saved.listings.includes(listing.id));
  const toggleSaved = useAppStore((s) => s.toggleSavedListing);
  const compare = useAppStore((s) => s.compare);
  const addCompare = useAppStore((s) => s.addCompare);
  const removeCompareAt = useAppStore((s) => s.removeCompareAt);
  const priceFmt = usePriceFormat();
  const { t, locale } = useT();
  const compareIndex = compare.findIndex(
    (c) => c.kind === "listing" && c.entity.id === listing.id
  );
  const inCompare = compareIndex !== -1;

  return (
    // Same p-4 outer spacing as the Front Page's row container, so the right
    // panel sits the exact same distance from the header and viewport edge
    // as the Front Page's right results panel.
    <div className="px-4 py-4 lg:p-4">
      {/* Column gap matches the panel's distance from the header/edge (both
          16px) — the same spacing rule used everywhere a left/right panel
          sits next to the main column (Front Page, New Projects). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Gallery
            seedBase={listing.id}
            hasFacade={!!listing.facadeImage}
            hasVideo={!!listing.videoUrl}
          />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold text-white",
                  listing.transaction === "sale" && "bg-sale",
                  listing.transaction === "rent" && "bg-rent"
                )}
              >
                {transactionLabel(listing.transaction, listing.rentSubtype, locale)}
              </span>
              {listing.premium && (
                <span className="rounded-full bg-listing-premium px-2.5 py-1 text-xs font-semibold text-white">
                  {t("results.premium")}
                </span>
              )}
              <span className="text-xs text-neutral-400">
                {t("listing.listed", { date: formatRelativeDate(listing.createdAt, locale) })}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-neutral-900 sm:text-3xl">
              {listing.title}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {neighborhood?.name}, {listing.city}
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-panel border border-neutral-200 bg-white p-5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4">
            <div className="flex items-stretch gap-2.5">
              <div className="flex flex-col justify-center">
                <p className="text-2xl font-bold text-neutral-900">
                  {priceFmt(listing.price)}
                  {listing.transaction === "rent" && (
                    <span className="text-sm font-medium text-neutral-500">
                      {listing.rentSubtype === "daily" ? t("results.perNight") : t("results.perMonth")}
                    </span>
                  )}
                </p>
                {listing.pricePerSqm && (
                  <p className="text-xs text-neutral-500">
                    {priceFmt(Math.round(listing.pricePerSqm))}/m²
                    {listing.negotiable && t("listing.negotiable")}
                  </p>
                )}
              </div>
              {listing.fromProjectSlug && (
                <Link
                  href={`/project/${listing.fromProjectSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-800 lg:hidden"
                >
                  <Box className="h-4 w-4" />
                  {t("listing.experienceIn3dShort")}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 lg:flex-wrap">
              <button
                onClick={() => auth.signedIn && toggleSaved(listing.id)}
                disabled={!auth.signedIn}
                aria-pressed={saved}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-neutral-200 px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 lg:flex-none"
              >
                <Heart className={cn("h-4 w-4", saved && "fill-red-500 text-red-500")} />
                {saved ? t("listing.saved") : t("listing.save")}
              </button>
              <button
                onClick={() =>
                  inCompare
                    ? removeCompareAt(compareIndex)
                    : addCompare({ kind: "listing", entity: listing })
                }
                aria-pressed={inCompare}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-control px-3.5 py-2.5 text-sm font-semibold lg:flex-none",
                  inCompare
                    ? "bg-brand-500 text-white"
                    : "border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                )}
              >
                <SquareStack className="h-4 w-4" />
                {inCompare ? t("listing.inCompare") : t("nav.compare")}
              </button>
              <ShareButton
                url={`${SITE_URL}/listing/${listing.slug}`}
                title={listing.title}
                className="flex-1 lg:flex-none"
              />
            </div>
          </div>

          <AdBanner />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact icon={BedDouble} label={t("filters.bedrooms")} value={listing.bedrooms} />
            <Fact icon={Bath} label={t("filters.bathrooms")} value={listing.bathrooms} />
            <Fact icon={Ruler} label={t("listing.area")} value={formatArea(listing.area)} />
            <Fact
              icon={Layers}
              label={t("listing.floor")}
              value={listing.floor ? `${listing.floor}/${listing.totalFloors}` : "—"}
            />
          </div>

          <section>
            <h2 className="text-base font-bold text-neutral-900">{t("listing.description")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600">
              {listing.description[locale]}
            </p>
          </section>

          {listing.amenities.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-neutral-900">{t("filters.amenities")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-pill border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600"
                  >
                    {AMENITY_LABELS[locale][a]}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-base font-bold text-neutral-900">
              {t("listing.locationBuildingContext")}
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("listing.approxPrivacyNote")}
            </p>
            <StaticContextMap
              center={listing.coords}
              className="mt-3 aspect-[16/9] w-full"
            />
          </section>

          <div className="grid grid-cols-2 gap-3 rounded-panel border border-neutral-200 bg-white p-5 text-sm sm:grid-cols-3">
            <MetaRow icon={Calendar} label={t("listing.yearBuilt")} value={listing.yearBuilt ?? "—"} />
            <MetaRow label={t("filters.condition")} value={CONDITION_LABELS[locale][listing.condition]} />
            <MetaRow label={t("filters.propertyType")} value={PROPERTY_TYPE_LABELS[locale][listing.propertyType]} />
          </div>

          {related.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-neutral-900">
                {t("listing.moreIn", { area: neighborhood?.name ?? "" })}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {related.map((l) => (
                  <ListingCard key={l.id} listing={l} variant="grid" />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="glass-panel overflow-hidden rounded-panel shadow-sm lg:sticky lg:top-20 lg:self-start">
          <div className="p-5">
            <PublisherCard
              bare
              publisher={listing.publisher}
              whatsappMessage={`Hi, I'm interested in "${listing.title}"`}
              contentTitle={listing.title}
              contentUrl={`${SITE_URL}/listing/${listing.slug}`}
            />
          </div>
          {listing.fromProjectSlug && (
            <div className="border-t border-neutral-100 p-4">
              <Link
                href={`/project/${listing.fromProjectSlug}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
              >
                <Box className="h-3.5 w-3.5" />
                {t("listing.partOfProject", { project: listing.fromProjectName ?? "" })}
              </Link>
              <Link
                href={`/project/${listing.fromProjectSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 hidden items-center justify-center gap-1.5 rounded-control bg-neutral-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 lg:flex"
              >
                <Box className="h-4 w-4" />
                {t("listing.experienceIn3d")}
              </Link>
            </div>
          )}
          {listing.transaction === "sale" && (
            <>
              <div className="border-t border-neutral-100 p-4">
                <MortgageCalculator compact initialPrice={listing.price} />
              </div>
              <div className="border-t border-neutral-100 p-4">
                <InsuranceCalculator compact initialPrice={listing.price} />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-3.5 text-center">
      <Icon className="mx-auto h-4.5 w-4.5 text-brand-500" />
      <p className="mt-1.5 text-sm font-bold text-neutral-900">{value}</p>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Calendar;
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="mt-0.5 font-medium capitalize text-neutral-800">{value}</p>
    </div>
  );
}
