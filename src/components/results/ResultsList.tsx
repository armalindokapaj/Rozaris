"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useLiveListings } from "@/hooks/useLiveListings";
import { getVisibleListings, getVisibleProjects } from "@/lib/filtering";
import { ListingCard } from "./ListingCard";
import { ProjectCard } from "./ProjectCard";
import { SortDropdown } from "./SortDropdown";
import { EmptyState } from "./EmptyState";
import type { Listing, Project } from "@/lib/types";

const PAGE_SIZE = 12;

type Row = { kind: "listing"; item: Listing } | { kind: "project"; item: Project };

const GRID_COLS_CLASS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function ResultsList({
  layout,
  // Matches the map: results reflect the search filters, not whatever
  // happens to be panned into view, so an off-screen match isn't dropped
  // from the list either.
  restrictToBounds = false,
  columns = 3,
  topContent,
  restoreScrollTop,
  onScrollTopChange,
}: {
  layout: "panel" | "grid";
  restrictToBounds?: boolean;
  /** Grid column count — only meaningful when layout is "grid". */
  columns?: 2 | 3 | 4;
  /** Scrolls away with the grid; the result count/sort row remains sticky. */
  topContent?: ReactNode;
  restoreScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
}) {
  const filters = useAppStore((s) => s.filters);
  const mapBounds = useAppStore((s) => s.mapBounds);
  const mapAreaSearchBounds = useAppStore((s) => s.mapAreaSearchBounds);
  const liveListings = useAppStore((s) => s.liveListings);
  useLiveListings();
  const [page, setPage] = useState(1);
  const { t } = useT();

  // The sort/count header above has no scroll of its own, so a wheel
  // gesture there does nothing by default — forward it to the results
  // scroll container below so scrolling works from anywhere in the panel,
  // without moving or extending the visible scrollbar into the header.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current && restoreScrollTop != null) scrollRef.current.scrollTop = restoreScrollTop;
  }, [restoreScrollTop]);
  function forwardWheelToList(e: React.WheelEvent) {
    if (!scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollTop += e.deltaY;
  }

  // Reset to page 1 whenever the result set changes — adjusted during
  // render (React's recommended pattern) rather than in an effect.
  const [prevFilters, setPrevFilters] = useState(filters);
  const [prevBounds, setPrevBounds] = useState(mapBounds);
  if (filters !== prevFilters || mapBounds !== prevBounds) {
    setPrevFilters(filters);
    setPrevBounds(mapBounds);
    if (page !== 1) setPage(1);
  }

  const listingResults = useMemo(
    () =>
      getVisibleListings(
        filters,
        restrictToBounds ? mapAreaSearchBounds : mapBounds,
        restrictToBounds,
        liveListings
      ),
    [filters, mapBounds, mapAreaSearchBounds, restrictToBounds, liveListings]
  );
  const projectResults = useMemo(
    () => getVisibleProjects(filters, restrictToBounds ? mapAreaSearchBounds : mapBounds, restrictToBounds),
    [filters, mapBounds, mapAreaSearchBounds, restrictToBounds]
  );

  const rows: Row[] = useMemo(() => {
    const listingRows: Row[] = listingResults.map((item) => ({ kind: "listing", item }));
    const projectRows: Row[] = projectResults.map((item) => ({ kind: "project", item }));
    if (filters.projectsOnly) return projectRows;
    // Interleave: premium projects surface near the top, otherwise append after listings.
    return [...projectRows, ...listingRows];
  }, [listingResults, projectResults, filters.projectsOnly]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows =
    layout === "grid" ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : rows;

  const countBlock = (
    <div>
      <p className="font-serif text-xl text-neutral-900 lg:text-2xl">
        {total === 1
          ? t("results.resultSingular", { count: total })
          : t("results.resultPlural", { count: total })}
      </p>
      <p className="text-xs text-neutral-500">
        {restrictToBounds ? t("results.inThisMapArea") : t("results.acrossAllOfCity")}
      </p>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {layout === "panel" ? (
        // Mobile: results count on the left, sort on the right, one row.
        // Desktop map-mode side panel (narrower): sort centered on top,
        // result count below.
        <div
          onWheel={forwardWheelToList}
          className="flex shrink-0 flex-row-reverse items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3 lg:flex-col lg:items-stretch lg:justify-start"
        >
          <div className="lg:flex lg:justify-center">
            <SortDropdown />
          </div>
          {countBlock}
        </div>
      ) : null}

      {total === 0 && layout === "panel" ? (
        <div ref={scrollRef} onScroll={(e) => onScrollTopChange?.(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <EmptyState />
        </div>
      ) : layout === "panel" ? (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-thin p-3">
          {pageRows.map((row) =>
            row.kind === "listing" ? (
              <ListingCard key={row.item.id} listing={row.item} />
            ) : (
              <ProjectCard key={row.item.id} project={row.item} />
            )
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          {topContent}
          <div onWheel={forwardWheelToList} className="sticky top-0 z-20 flex items-center justify-between gap-2 border-y border-neutral-200 bg-white px-5 py-3 shadow-[0_2px_6px_rgba(17,17,24,0.04)]">
            {countBlock}
            <SortDropdown />
          </div>
          {total === 0 ? <EmptyState /> : <div className="p-3">
          <div className={`grid ${GRID_COLS_CLASS[columns]} gap-3`}>
            {pageRows.map((row) =>
              row.kind === "listing" ? (
                <ListingCard key={row.item.id} listing={row.item} variant="grid" />
              ) : (
                <ProjectCard key={row.item.id} project={row.item} />
              )
            )}
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label={t("results.previousPage")}
                className="flex h-9 w-9 items-center justify-center rounded-control border border-neutral-200 text-neutral-600 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-neutral-600">
                {t("results.pageOf", { page, total: totalPages })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label={t("results.nextPage")}
                className="flex h-9 w-9 items-center justify-center rounded-control border border-neutral-200 text-neutral-600 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}</div>}
        </div>
      )}
    </div>
  );
}
