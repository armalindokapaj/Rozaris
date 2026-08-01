"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { MapView } from "@/components/map/MapView";
import { FiltersPanel } from "@/components/search/FiltersPanel";
import { FiltersForm } from "@/components/search/FiltersForm";
import { ResultsList } from "@/components/results/ResultsList";
import { CompareTray } from "@/components/compare/CompareTray";
import { ModeSwitch } from "@/components/home/ModeSwitch";
import { OnboardingHint } from "@/components/common/OnboardingHint";
import { MobileSearchRow } from "@/components/home/MobileSearchRow";
import { CategoryQuickFilters } from "@/components/home/CategoryQuickFilters";
import { PopularAreasRow } from "@/components/home/PopularAreasRow";
import { Explore3DPromoCard } from "@/components/home/Explore3DPromoCard";
import { BottomSheet, type SheetSnap } from "@/components/common/BottomSheet";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const mode = useAppStore((s) => s.mode);
  const mobileSheet = useAppStore((s) => s.mobileSheet);
  const setMobileSheet = useAppStore((s) => s.setMobileSheet);

  const [listingsSnap, setListingsSnap] = useState<SheetSnap>("half");
  const [filtersSnap, setFiltersSnap] = useState<SheetSnap>("expanded");
  const { t } = useT();

  // Note: mobile vs. desktop chrome below is switched with Tailwind's `lg:`
  // breakpoint classes (both trees are always in the DOM), not a JS media
  // query — a client-only mount/unmount split here would make the server
  // and first client render disagree on tree shape and trigger a hydration
  // mismatch. The CSS-only approach costs a second (hidden, cheap) results
  // list in the DOM, which is the standard, hydration-safe tradeoff.

  return (
    <div className="relative flex h-full min-h-0 flex-col lg:flex-row lg:gap-4 lg:p-4">
      {/* Desktop filters sidebar (~20%). Width is calc()-adjusted because
          flexbox `gap` isn't automatically subtracted from percentage-based
          flex-item widths — three columns at 20/60/20% plus two lg:gap-4
          gaps (32px) would overflow the row by 32px without this. */}
      <aside className="hidden lg:block lg:h-full lg:w-[calc(20%-11px)] lg:shrink-0">
        <FiltersPanel />
      </aside>

      {/* Mobile-only search row */}
      <MobileSearchRow onOpenFilters={() => setMobileSheet("filters")} />

      {/* Persistent map column — one Mapbox instance shared across map/list modes and breakpoints */}
      <div
        className={cn(
          "relative min-h-0 w-full flex-1 lg:flex-none lg:h-full",
          mode === "map" ? "lg:w-[calc(60%-11px)]" : "lg:w-[calc(40%-11px)]"
        )}
      >
        <MapView className="lg:rounded-panel" controlsClassName="top-3 right-3" />
        <ModeSwitch className="absolute left-1/2 top-4 z-20 hidden -translate-x-1/2 lg:flex" />
        <OnboardingHint />
        <CompareTray />

        {/* Mobile listings sheet */}
        <BottomSheet
          open={mobileSheet === "listings"}
          onClose={() => setMobileSheet(null)}
          snap={listingsSnap}
          onSnapChange={setListingsSnap}
          snapPoints={["collapsed", "half", "expanded"]}
        >
          <div className="space-y-3 pb-2 pt-1">
            <CategoryQuickFilters onMore={() => setMobileSheet("filters")} />
            <PopularAreasRow />
            <Explore3DPromoCard />
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
            className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-pill bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
          >
            <List className="h-4 w-4" />
            {t("home.showList")}
          </button>
        )}
      </div>

      {/* Desktop results panel */}
      <div
        className={cn(
          "hidden min-h-0 lg:block lg:h-full lg:shrink-0",
          mode === "map" ? "lg:w-[calc(20%-11px)]" : "lg:w-[calc(40%-11px)]"
        )}
      >
        <div className="glass-panel h-full overflow-hidden rounded-panel shadow-sm">
          <ResultsList layout={mode === "map" ? "panel" : "grid"} />
        </div>
      </div>
    </div>
  );
}
