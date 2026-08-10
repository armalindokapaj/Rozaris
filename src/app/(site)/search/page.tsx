"use client";

import { useState } from "react";
import { List, Maximize2, Minimize2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { MapView } from "@/components/map/MapView";
import { TopFilterBar } from "@/components/search/TopFilterBar";
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

export default function SearchPage() {
  const mode = useAppStore((s) => s.mode);
  const mobileSheet = useAppStore((s) => s.mobileSheet);
  const setMobileSheet = useAppStore((s) => s.setMobileSheet);

  const [listingsSnap, setListingsSnap] = useState<SheetSnap>("preview");
  const [filtersSnap, setFiltersSnap] = useState<SheetSnap>("expanded");
  // Desktop-only: temporarily expands the map to full width, hiding the
  // listings column. Only meaningful while mode === "map" — list mode
  // already hides the map entirely, so it's reset whenever mode changes
  // away from "map" to avoid a stale expanded state resurfacing later.
  const [mapFullWidth, setMapFullWidth] = useState(false);
  // Reset the moment `mode` changes away from "map" (adjusted during render,
  // React's recommended pattern, rather than in an effect) so a stale
  // expanded state can't resurface the next time the user switches back.
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode !== "map" && mapFullWidth) setMapFullWidth(false);
  }
  const { t } = useT();

  // Note: mobile vs. desktop chrome below is switched with Tailwind's `lg:`
  // breakpoint classes (both trees are always in the DOM), not a JS media
  // query — a client-only mount/unmount split here would make the server
  // and first client render disagree on tree shape and trigger a hydration
  // mismatch. The CSS-only approach costs a second (hidden, cheap) results
  // list in the DOM, which is the standard, hydration-safe tradeoff.

  const resultsHidden = mode === "map" && mapFullWidth;

  return (
    <div className="relative flex h-full min-h-0 flex-col lg:gap-3 lg:p-4">
      {/* Desktop top filter bar — collapsed pills that only expand into a
          popover when clicked, replacing the always-open sidebar. */}
      <div className="relative z-30 hidden shrink-0 lg:block">
        <div className="glass-panel flex items-center justify-between gap-3 rounded-panel px-4 py-3">
          <TopFilterBar className="flex-1" />
        </div>
      </div>

      {/* Mobile-only search row */}
      <MobileSearchRow onOpenFilters={() => setMobileSheet("filters")} />

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-4">
        {/* Persistent map column — one Mapbox instance shared across map/list modes and breakpoints */}
        <div
          className={cn(
            "relative min-h-0 w-full flex-1 lg:h-full lg:flex-none lg:transition-[width] lg:duration-300",
            mode === "list"
              ? "lg:w-0 lg:overflow-hidden lg:opacity-0"
              : mapFullWidth
              ? "lg:w-full"
              : "lg:w-[calc(50%-8px)]"
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
            <MapView className="lg:rounded-panel" controlsClassName="top-3 right-3" />
          </div>

          {/* Desktop: expand the map to full width, or shrink it back to
              the 50/50 split — centered over the map either way. */}
          {mode === "map" && (
            <button
              onClick={() => setMapFullWidth((v) => !v)}
              className="glass-panel absolute left-1/2 top-4 z-20 hidden -translate-x-1/2 items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold text-neutral-900 lg:flex"
            >
              {mapFullWidth ? (
                <>
                  <Minimize2 className="h-4 w-4" /> {t("home.smallMap")}
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" /> {t("home.fullMap")}
                </>
              )}
            </button>
          )}

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
              <ResultsList layout="panel" />
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
            <div className="sticky bottom-0 border-t border-neutral-100 bg-white p-4">
              <button
                onClick={() => setMobileSheet("listings")}
                className="w-full rounded-control bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600"
              >
                {t("home.showResults")}
              </button>
            </div>
          </BottomSheet>

          {!mobileSheet && (
            <button
              onClick={() => setMobileSheet("listings")}
              className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-2)] lg:hidden"
            >
              <List className="h-4 w-4" />
              {t("home.showList")}
            </button>
          )}
        </div>

        {/* Desktop results column — Map/List/Compare switch sits above it
            (on the right), instead of floating over the map. */}
        <div
          className={cn(
            "hidden min-h-0 flex-col gap-2 lg:flex lg:h-full lg:shrink-0 lg:transition-[width] lg:duration-300",
            resultsHidden
              ? "lg:w-0 lg:overflow-hidden lg:opacity-0"
              : mode === "list"
              ? "lg:w-full"
              : "lg:w-[calc(50%-8px)]"
          )}
        >
          <div className="flex shrink-0 justify-end">
            <ModeSwitch />
          </div>
          <div className="glass-panel min-h-0 flex-1 overflow-hidden rounded-panel">
            <ResultsList layout="grid" columns={mode === "list" ? 4 : 2} />
          </div>
        </div>
      </div>
    </div>
  );
}
