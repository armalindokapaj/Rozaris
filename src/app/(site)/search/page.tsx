"use client";

import { useState } from "react";
import { List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { MapView, type MapCamera } from "@/components/map/MapView";
import { SentenceFilterBar } from "@/components/search/SentenceFilterBar";
import { FiltersForm } from "@/components/search/FiltersForm";
import { ResultsList } from "@/components/results/ResultsList";
import { CompareTray } from "@/components/compare/CompareTray";
import { ModeSwitch } from "@/components/home/ModeSwitch";
import { OnboardingHint } from "@/components/common/OnboardingHint";
import { MobileSearchRow } from "@/components/home/MobileSearchRow";
import { CategoryQuickFilters } from "@/components/home/CategoryQuickFilters";
import { PopularAreasRow } from "@/components/home/PopularAreasRow";
import { BottomSheet, type SheetSnap } from "@/components/common/BottomSheet";
import { cn } from "@/lib/utils";
import { ListingPreviewPanel } from "@/components/results/ListingPreviewPanel";
import { searchableListings } from "@/lib/mockData";

export default function SearchPage() {
  const mode = useAppStore((s) => s.mode);
  const mobileSheet = useAppStore((s) => s.mobileSheet);
  const setMobileSheet = useAppStore((s) => s.setMobileSheet);
  const setMode = useAppStore((s) => s.setMode);
  const selectedListingId = useAppStore((s) => s.selectedListingId);
  const selectListing = useAppStore((s) => s.selectListing);
  const mapAreaSearchBounds = useAppStore((s) => s.mapAreaSearchBounds);

  const [listingsSnap, setListingsSnap] = useState<SheetSnap>("preview");
  const [filtersSnap, setFiltersSnap] = useState<SheetSnap>("expanded");
  const [mapFullWidth, setMapFullWidth] = useState(false);
  const [resultsScrollTop, setResultsScrollTop] = useState(0);
  const [searchMapCamera, setSearchMapCamera] = useState<MapCamera | null>(null);
  const [restoreMapToken, setRestoreMapToken] = useState(0);
  const { t } = useT();
  const selectedListing = selectedListingId ? searchableListings.find((listing) => listing.id === selectedListingId) : null;

  // Note: mobile vs. desktop chrome below is switched with Tailwind's `lg:`
  // breakpoint classes (both trees are always in the DOM), not a JS media
  // query — a client-only mount/unmount split here would make the server
  // and first client render disagree on tree shape and trigger a hydration
  // mismatch. The CSS-only approach costs a second (hidden, cheap) results
  // list in the DOM, which is the standard, hydration-safe tradeoff.

  return (
    <div className="relative flex h-full min-h-0 flex-col lg:flex-row">

      {/* Mobile-only search row */}
      <MobileSearchRow onOpenFilters={() => setMobileSheet("filters")} />

      <div className="relative flex min-h-0 flex-1 flex-col lg:contents">
        {/* Persistent map column — one Mapbox instance shared across map/list modes and breakpoints */}
        <div
          className={cn(
            "relative min-h-0 w-full flex-1 lg:h-full lg:flex-none lg:transition-[width] lg:duration-300",
            mode === "list"
              ? "lg:w-0 lg:overflow-hidden lg:opacity-0"
              : mapFullWidth
              ? "lg:w-full"
              : "lg:w-1/2"
          )}
        >
          <div
            // Mobile only: tapping the map collapses the listings sheet back
            // to its default preview size, giving the map its full height
            // back (the sheet only auto-expands via the handle-bar tap below).
            onClick={() => {
              if (mobileSheet === "listings" && listingsSnap !== "preview") {
                setListingsSnap("preview");
              }
            }}
            className="absolute inset-0"
          >
            <MapView
              controlsClassName="top-3 right-3"
              fullScreen={mapFullWidth}
              onToggleFullScreen={() => setMapFullWidth((value) => !value)}
              onSaveCamera={setSearchMapCamera}
              restoreCamera={searchMapCamera}
              restoreCameraToken={restoreMapToken}
            />
          </div>

          <OnboardingHint />
          <CompareTray />

          {/* Mobile listings sheet */}
          <BottomSheet
            open={mobileSheet === "listings"}
            onClose={() => setMobileSheet(null)}
            snap={listingsSnap}
            onSnapChange={setListingsSnap}
            snapPoints={["preview", "half", "expanded"]}
            tapToExpand="half"
          >
            <div className="space-y-3 pb-2 pt-1">
              <CategoryQuickFilters onMore={() => setMobileSheet("filters")} />
              <PopularAreasRow />
              <div className="mx-4 h-px bg-neutral-100" />
              <ResultsList layout="panel" restrictToBounds={!!mapAreaSearchBounds} />
            </div>
          </BottomSheet>

          {/* Mobile filters sheet */}
          <BottomSheet
            open={mobileSheet === "filters"}
            onClose={() => setMobileSheet("listings")}
            snap={filtersSnap}
            onSnapChange={setFiltersSnap}
            snapPoints={["expanded"]}
            title={t("home.filters")}
          >
            <FiltersForm compact />
          </BottomSheet>

          <div className="glass-panel absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center rounded-pill p-1 shadow-[var(--shadow-2)] lg:hidden" role="tablist" aria-label={t("home.viewMode")}>
            <button onClick={() => setMobileSheet("filters")} className="flex h-10 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold text-neutral-700" aria-label={t("home.openFilters")}>
              <SlidersHorizontal className="h-4 w-4" /> {t("home.filters")}
            </button>
            <button role="tab" aria-selected={mode === "map"} onClick={() => { setMode("map"); setMobileSheet("listings"); }} className={cn("flex h-10 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold", mode === "map" ? "bg-neutral-900 text-white" : "text-neutral-600")}>
              <MapIcon className="h-4 w-4" /> {t("nav.map")}
            </button>
            <button role="tab" aria-selected={mode === "list"} onClick={() => { setMode("list"); setListingsSnap("expanded"); setMobileSheet("listings"); }} className={cn("flex h-10 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold", mode === "list" ? "bg-neutral-900 text-white" : "text-neutral-600")}>
              <List className="h-4 w-4" /> {t("nav.list")}
            </button>
          </div>
        </div>

        {/* Desktop: filters live at the top of the right workspace, directly
            above its independently scrolling listings rail. */}
        <div
          className={cn(
            "hidden min-h-0 lg:flex lg:h-full lg:flex-col lg:shrink-0",
            mapFullWidth
              ? "lg:w-0 lg:overflow-hidden lg:opacity-0"
              : mode === "list"
              ? "lg:w-full"
              : "lg:w-1/2"
          )}
        >
          <div className="min-h-0 flex-1 overflow-hidden bg-white">
            {selectedListing ? <ListingPreviewPanel listing={selectedListing} onBack={() => { selectListing(null); setMode("map"); setRestoreMapToken((value) => value + 1); }} /> : <ResultsList
              layout="grid"
              columns={mode === "list" ? 4 : 2}
              restrictToBounds={!!mapAreaSearchBounds}
              restoreScrollTop={resultsScrollTop}
              onScrollTopChange={setResultsScrollTop}
              topContent={
                <div className="border-b border-neutral-200 bg-neutral-50 px-5 pb-5 pt-5">
                  <SentenceFilterBar />
                  <div className="flex justify-end px-5 pt-3"><ModeSwitch /></div>
                </div>
              }
            />}
          </div>
        </div>
      </div>
    </div>
  );
}
