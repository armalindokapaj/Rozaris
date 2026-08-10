"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
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
}: {
  layout: "panel" | "grid";
  restrictToBounds?: boolean;
  /** Grid column count — only meaningful when layout is "grid". */
  columns?: 2 | 3 | 4;
}) {
  const filters = useAppStore((s) => s.filters);
  const mapBounds = useAppStore((s) => s.mapBounds);
  const [page, setPage] = useState(1);
  const { t } = useT();

  // The sort/count header above has no scroll of its own, so a wheel
  // gesture there does nothing by default — forward it to the results
  // scroll container below so scrolling works from anywhere in the panel,
  // without moving or extending the visible scrollbar into the header.
  const scrollRef = useRef<HTMLDivElement>(null);
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
    () => getVisibleListings(filters, mapBounds, restrictToBounds),
    [filters, mapBounds, restrictToBounds]
  );
  const projectResults = useMemo(
    () => getVisibleProjects(filters, mapBounds, restrictToBounds),
    [filters, mapBounds, restrictToBounds]
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
      <p className="text-sm font-semibold text-neutral-900">
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
    <div className="flex h-full flex-col">
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
      ) : (
        <div
          onWheel={forwardWheelToList}
          className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3"
        >
          {countBlock}
          <SortDropdown />
        </div>
      )}

      {total === 0 ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin">
          <EmptyState />
        </div>
      ) : layout === "panel" ? (
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto scroll-thin p-3">
          {pageRows.map((row) =>
            row.kind === "listing" ? (
              <ListingCard key={row.item.id} listing={row.item} />
            ) : (
              <ProjectCard key={row.item.id} project={row.item} />
            )
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin p-4">
          <div className={`grid ${GRID_COLS_CLASS[columns]} gap-4`}>
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
          )}
        </div>
      )}
    </div>
  );
}
