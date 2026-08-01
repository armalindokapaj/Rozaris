"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { getVisibleListings, getVisibleProjects } from "@/lib/filtering";
import { ListingCard } from "./ListingCard";
import { ProjectCard } from "./ProjectCard";
import { SortDropdown } from "./SortDropdown";
import { EmptyState } from "./EmptyState";
import type { Listing, Project } from "@/lib/types";

const PAGE_SIZE = 12;

type Row = { kind: "listing"; item: Listing } | { kind: "project"; item: Project };

export function ResultsList({
  layout,
  restrictToBounds = true,
}: {
  layout: "panel" | "grid";
  restrictToBounds?: boolean;
}) {
  const filters = useAppStore((s) => s.filters);
  const mapBounds = useAppStore((s) => s.mapBounds);
  const [page, setPage] = useState(1);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            {total} {total === 1 ? "result" : "results"}
          </p>
          <p className="text-xs text-neutral-500">
            {restrictToBounds ? "In this map area" : "Across all of Tirana"}
          </p>
        </div>
        <SortDropdown />
      </div>

      {total === 0 ? (
        <div className="flex-1 overflow-y-auto scroll-thin">
          <EmptyState />
        </div>
      ) : layout === "panel" ? (
        <div className="flex-1 space-y-3 overflow-y-auto scroll-thin p-3">
          {pageRows.map((row) =>
            row.kind === "listing" ? (
              <ListingCard key={row.item.id} listing={row.item} />
            ) : (
              <ProjectCard key={row.item.id} project={row.item} />
            )
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scroll-thin p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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
                aria-label="Previous page"
                className="flex h-9 w-9 items-center justify-center rounded-control border border-neutral-200 text-neutral-600 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-neutral-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                aria-label="Next page"
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
