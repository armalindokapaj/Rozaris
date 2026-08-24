"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useAppStore } from "@/lib/store";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { cn, formatPrice } from "@/lib/utils";
import type { Unit } from "@/lib/types";
import { DOCK_HEIGHT_DESKTOP, DOCK_HEIGHT_MOBILE_STANDARD } from "../viewer-hud/layoutState";
import { UnitDetailView } from "./UnitDetailView";
import { convertUnitPrice, formatUnitArea } from "./unitDisplay";
import {
  activeFilterCount,
  bedroomLabel,
  filterUnits,
  sortUnits,
  STATUS_DOT,
  type SortOption,
  type UnitFilterState,
} from "./unitFilters";

/** Units Search Mode PRD §32's mobile browsing pattern, finally built.
 *
 * Until now the dock's "Filter List" trigger existed on mobile, was fully
 * styled, called `onToggleUnitsList` — and nothing below `lg` read the
 * boolean it flipped, because `getViewerLayoutState` gated the real panel
 * on `isDesktop` (a deliberate gate: the fixed 380px panel ate a 390px
 * viewport whole). This is the surface that gate was waiting for.
 *
 * Three things make this a sheet rather than a rotated copy of the desktop
 * panel:
 *
 * 1. **The 3D stays on screen.** The point of the request driving this
 *    ("every unit clicked on the filtering list to also highlight it in
 *    the 3D building") is a *correspondence*, and a correspondence you
 *    cannot see is worth nothing. Every snap point leaves real viewport
 *    above the sheet, and picking a unit drops the sheet to `peek` so the
 *    building is unmistakably visible at the moment it reacts.
 * 2. **It never covers the dock.** The dock is where Units' filters live
 *    on mobile (`UnitsContent`'s own mobile branch), and it carries the
 *    trigger that closes this sheet again. `bottom` is measured off the
 *    live dock (`[data-viewer-dock]`, the same hook `UnitPreviewCard`
 *    already measures) rather than assumed, because below `lg` the dock's
 *    height is content-driven and Units is explicitly allowed to be the
 *    tall one.
 * 3. **Filters are not duplicated here.** The dock already owns Surface/
 *    Rooms/Availability on mobile, with its own collapse. A second filter
 *    stack inside this sheet would be two controls for one concept — the
 *    "Filters" button in this header expands the dock's own stack instead
 *    (`onOpenDockFilters`). Search and sort DO live here: neither exists
 *    on the dock, and both are list concerns rather than model concerns.
 *
 * `position: absolute`, not `fixed` — and mounted by `ProjectViewerRuntime`
 * as a child of its own root rather than inside `ViewerHUD`. `MoreMenu.tsx`
 * documents the bug that makes this non-negotiable: a transformed ancestor
 * becomes the containing block for `fixed`, and the HUD GSAP-transforms its
 * dock wrapper constantly.
 *
 * Height is animated with a CSS transition rather than GSAP, matching
 * `BottomSheet.tsx` (this repo's only other drag-to-resize sheet) — the
 * global `prefers-reduced-motion` rule in globals.css zeroes it, so this
 * needs no reduced-motion branch of its own, and it sidesteps GSAP's
 * documented inability to tween `height: auto` that `ProjectViewerDock`
 * had to work around.
 */

type SheetSnap = "peek" | "half" | "full";
const SNAP_ORDER: SheetSnap[] = ["peek", "half", "full"];
/** Fractions of the height actually available above the dock — not of the
 * viewport — so a taller Units dock shrinks the sheet instead of pushing
 * its bottom edge underneath. */
const SNAP_FRACTION: Record<SheetSnap, number> = {
  peek: 0.36,
  half: 0.62,
  full: 0.94,
};
/** Gap between the sheet's bottom edge and the dock's top edge. */
const DOCK_GAP = 10;
/** Floor under `peek`, in px. `peek` is where the sheet lands the moment a
 * unit is picked, and at that point it has to hold the drag handle, the
 * search/sort header, the selected-unit summary bar AND at least one whole
 * row. A pure fraction of the available height does not: on a short
 * viewport the first pass computed ~230px here, the flex column overflowed,
 * and the summary bar rendered *through* the sheet's own bottom edge and
 * over the dock. Verified against a real 390x664 iPhone 13 viewport. */
const PEEK_MIN_PX = 300;
/** Room kept above the sheet at its tallest, so the header identity plate
 * and the compass/settings capsule are never fully buried. */
const TOP_RESERVE = 84;
const PAGE_SIZE = 30;

export function MobileUnitsSheet({
  open,
  onClose,
  units,
  selectedUnitId,
  onSelectUnit,
  unmappedUnitId,
  filters,
  onFiltersChange,
  onOpenDockFilters,
}: {
  open: boolean;
  onClose: () => void;
  units: Unit[];
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
  unmappedUnitId: string | null;
  filters: UnitFilterState;
  onFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
  /** Unfolds the dock's own mobile filter stack — see this file's own doc
   * comment on why filters deliberately do not live in here. */
  onOpenDockFilters: () => void;
}) {
  const { t } = useT();
  const { areaUnit } = useViewerPreferences();
  const displayCurrency = useAppStore((s) => s.currency);
  const eurToAllRate = useAppStore((s) => s.eurToAllRate);

  const [snap, setSnap] = useState<SheetSnap>("half");
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [available, setAvailable] = useState({ height: 0, bottom: DOCK_HEIGHT_MOBILE_STANDARD + 2 + DOCK_GAP });

  const dragStartY = useRef(0);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  // Same measurement `UnitPreviewCard` makes, for the same reason: below
  // `lg` the dock's height is content-driven and mode-dependent, so no
  // constant can describe it. The constants are only the pre-mount frame's
  // fallback (`+ 2` is DockShell's own border, which its 70px content
  // floor doesn't include).
  const measure = useCallback(() => {
    const rect = document.querySelector<HTMLElement>("[data-viewer-dock]")?.getBoundingClientRect();
    // The dock's own TOP edge, not its height. A first pass used
    // `height + gap` and left the sheet 2px inside the dock on a real
    // iPhone 13, because the dock is not flush with the viewport bottom —
    // its wrapper carries `bottom-[max(0.75rem,env(safe-area-inset-
    // bottom))]`, which is 12px on most phones and more on a notched one
    // now that `viewport-fit=cover` is actually set. Measuring the top
    // edge absorbs that inset, the safe area, and any future change to
    // either, without this file having to know about any of them.
    const bottom = rect
      ? Math.round(window.innerHeight - rect.top) + DOCK_GAP
      : (window.innerWidth < 1024 ? DOCK_HEIGHT_MOBILE_STANDARD + 2 : DOCK_HEIGHT_DESKTOP) + 12 + DOCK_GAP;
    const height = Math.max(180, window.innerHeight - bottom - TOP_RESERVE);
    setAvailable((prev) => (prev.height === height && prev.bottom === bottom ? prev : { height, bottom }));
  }, []);

  // Every path into `measure` here is a *callback* — a ResizeObserver
  // firing, a resize event, a rAF tick — never a synchronous call in this
  // effect's own body. That isn't stylistic: this codebase enforces
  // react-hooks/set-state-in-effect, which rejects the synchronous shape
  // outright. It also happens to be the correct shape, since the thing
  // being measured genuinely is an external system whose size changes on
  // its own schedule.
  //
  // The dock is not a fixed backdrop: its filter stack folds and unfolds,
  // and the shell morphs between modes, each of which changes its height
  // under this sheet. `ResizeObserver` fires once on `observe()` too, so
  // it doubles as the initial measurement — the rAF below is only a
  // belt-and-braces first tick for a browser without ResizeObserver, and
  // for the window-height half that observing the dock alone can't see.
  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    const dock = document.querySelector<HTMLElement>("[data-viewer-dock]");
    const ro = dock && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    ro?.observe(dock!);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [open, measure]);

  const filtered = useMemo(() => sortUnits(filterUnits(units, filters), filters.sort), [units, filters]);
  const selectedUnit = useMemo(() => units.find((u) => u.id === selectedUnitId) ?? null, [units, selectedUnitId]);
  const filterCount = activeFilterCount(filters);

  // Derived, never a `setVisibleCount` in an effect (this codebase's
  // react-hooks/set-state-in-effect rule rejects that shape): a selection
  // arriving from a 3D tap can name a unit past the current page boundary,
  // and scrolling to a row that was never rendered does nothing.
  const selectedIndex = selectedUnitId ? filtered.findIndex((u) => u.id === selectedUnitId) : -1;
  const effectiveCount =
    selectedIndex >= visibleCount ? Math.ceil((selectedIndex + 1) / PAGE_SIZE) * PAGE_SIZE : visibleCount;
  const visible = filtered.slice(0, effectiveCount);

  useEffect(() => {
    if (!open || !selectedUnitId || detailOpen) return;
    selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, selectedUnitId, detailOpen]);

  // Px, not fractions, everywhere below — `peek` has a floor (see
  // PEEK_MIN_PX) so its real height is not a fixed share of the available
  // space, and comparing fractions after that would snap to the wrong
  // point on short viewports.
  const snapPx = useCallback(
    (point: SheetSnap) => {
      const raw = available.height * SNAP_FRACTION[point];
      return Math.round(point === "peek" ? Math.min(available.height, Math.max(raw, PEEK_MIN_PX)) : raw);
    },
    [available.height]
  );
  const heightPx = snapPx(snap) - dragOffset;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setDragOffset(e.clientY - dragStartY.current);
    },
    [dragging]
  );

  const onPointerUp = useCallback(() => {
    if (!dragging) return;
    const settledPx = snapPx(snap) - dragOffset;
    setDragging(false);
    setDragOffset(0);
    // Dragged well below the shortest snap = dismiss. `0.6` of `peek`
    // rather than a bare "below peek" so a slightly overshot drag settles
    // back onto peek instead of closing a list the visitor was resizing.
    if (settledPx < snapPx("peek") * 0.6) {
      onClose();
      return;
    }
    let nearest: SheetSnap = "peek";
    let best = Infinity;
    for (const point of SNAP_ORDER) {
      const dist = Math.abs(snapPx(point) - settledPx);
      if (dist < best) {
        nearest = point;
        best = dist;
      }
    }
    setSnap(nearest);
  }, [dragging, dragOffset, snap, snapPx, onClose]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // The whole point of the sheet: picking a row must let you SEE the
  // building react. Dropping to `peek` (never lower, never closing) is
  // what guarantees the block the camera just flew to is actually on
  // screen — a selection made behind a half- or full-height sheet is a
  // correspondence the visitor has to take on faith.
  function handleRowClick(unit: Unit) {
    onSelectUnit(unit.id);
    setSnap("peek");
  }

  function handleFilterPatch(patch: Partial<UnitFilterState>) {
    onFiltersChange((prev) => ({ ...prev, ...patch }));
    setVisibleCount(PAGE_SIZE);
  }

  if (!open) return null;

  const summaryBar = selectedUnit ? (
    <div className="shrink-0 border-t border-white/10 bg-brand-500/[0.07] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-white">{selectedUnit.code}</span>
            <span className="shrink-0 font-numeric text-sm font-semibold text-white">
              {formatPrice(
                convertUnitPrice(selectedUnit.price, selectedUnit.currency, displayCurrency, eurToAllRate),
                displayCurrency
              )}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-white/50">
            {t("units.floorLabel", { floor: selectedUnit.floor })} · {bedroomLabel(selectedUnit.bedrooms)} ·{" "}
            {formatUnitArea(selectedUnit.area, areaUnit)}
          </p>
          {unmappedUnitId === selectedUnit.id && (
            <p className="mt-0.5 text-[11px] leading-tight text-amber-300/80">{t("units.notInModel")}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex h-9 shrink-0 items-center rounded-control bg-brand-500 px-3 text-xs font-semibold text-white"
        >
          {t("units.viewDetails")}
        </button>
        <button
          type="button"
          onClick={() => onSelectUnit(null)}
          aria-label={t("units.clearSelection")}
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-control text-white/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 lg:hidden"
      style={{ bottom: available.bottom }}
      aria-hidden={!open}
    >
      <div
        role="dialog"
        aria-label={t("units.title")}
        className={cn(
          // `overflow-hidden` IS correct here, unlike on `DockShell`/
          // `UnitsContent`/`UnitsBar` — all three of which carry a note
          // about it silently clipping an upward-opening `DockPopover` to
          // invisible while taps fell through to the canvas. Nothing
          // inside this sheet opens outside its own box: the only
          // popover-ish control is the sort `<select>`, whose menu is
          // browser chrome rather than a positioned descendant, and the
          // dock's real popovers are in a different subtree entirely.
          // Without it, rows and the summary bar paint straight over the
          // 16px radius and out through the bottom edge onto the dock.
          "viewer-glass pointer-events-auto mx-2 flex flex-col overflow-hidden rounded-[16px]",
          dragging ? "" : "transition-[height] duration-300 ease-out"
        )}
        style={{ height: heightPx, background: "rgba(12, 14, 18, 0.96)" }}
      >
        {/* Drag handle — its own generous row rather than the whole sheet,
            so a flick meant to scroll the list can never be read as a
            resize. Same split BottomSheet.tsx uses. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 pb-1 pt-2.5 active:cursor-grabbing"
        >
          <span className="h-1 w-9 rounded-full bg-white/25" aria-hidden="true" />
        </div>

        {detailOpen && selectedUnit ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3 pt-1">
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="flex h-9 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/70"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {t("units.backToSearch")}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("units.close")}
                className="flex h-9 w-9 items-center justify-center rounded-control text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <UnitDetailView
              unit={selectedUnit}
              isFavorite={favorites.has(selectedUnit.id)}
              onToggleFavorite={() => toggleFavorite(selectedUnit.id)}
              displayCurrency={displayCurrency}
              eurToAllRate={eurToAllRate}
              areaUnit={areaUnit}
            />
          </>
        ) : (
          <>
            <div className="shrink-0 space-y-2 border-b border-white/10 px-3 pb-2.5 pt-1">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={filters.query}
                    onChange={(e) => handleFilterPatch({ query: e.target.value })}
                    placeholder={t("units.searchPlaceholder")}
                    className="h-10 w-full rounded-control border border-white/10 bg-white/5 pl-9 pr-2 text-sm text-white placeholder:text-white/35"
                  />
                </div>
                <button
                  type="button"
                  onClick={onOpenDockFilters}
                  aria-label={t("units.filtersToggle")}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-xs font-medium",
                    filterCount > 0 ? "border-brand-400/50 bg-brand-500/10 text-brand-400" : "border-white/15 text-white/80"
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {filterCount > 0 && <span className="font-numeric">{filterCount}</span>}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("units.close")}
                  className="flex h-10 w-9 shrink-0 items-center justify-center rounded-control text-brand-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-xs text-white/50">{t("units.resultsCount", { count: filtered.length })}</span>
                <select
                  value={filters.sort}
                  onChange={(e) => handleFilterPatch({ sort: e.target.value as SortOption })}
                  aria-label={t("units.sort.recommended")}
                  className="h-8 min-w-0 rounded-control border border-white/10 bg-white/5 px-1.5 text-xs text-white/70"
                >
                  {(["recommended", "priceAsc", "priceDesc", "areaAsc", "areaDesc", "floorAsc", "floorDesc"] as SortOption[]).map(
                    (opt) => (
                      <option key={opt} value={opt} className="bg-neutral-900">
                        {t(`units.sort.${opt}`)}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-thin px-3 py-2">
              {visible.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-white/40">{t("units.noResults")}</p>
              ) : (
                <div className="space-y-1.5">
                  {visible.map((unit) => {
                    const isSelected = unit.id === selectedUnitId;
                    return (
                      <button
                        key={unit.id}
                        ref={isSelected ? selectedRowRef : undefined}
                        type="button"
                        onClick={() => handleRowClick(unit)}
                        aria-current={isSelected ? "true" : undefined}
                        className={cn(
                          "w-full rounded-control border p-3 text-left transition-colors",
                          isSelected ? "border-brand-400/60 bg-brand-500/15" : "border-white/5 bg-white/[0.03]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-white">{unit.code}</span>
                          <span className="shrink-0 font-numeric text-sm font-semibold text-white">
                            {formatPrice(
                              convertUnitPrice(unit.price, unit.currency, displayCurrency, eurToAllRate),
                              displayCurrency
                            )}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-white/50">
                          <span className="truncate">
                            {t("units.floorLabel", { floor: unit.floor })} · {bedroomLabel(unit.bedrooms)} ·{" "}
                            {formatUnitArea(unit.area, areaUnit)}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[unit.status])} aria-hidden="true" />
                            {t(`units.status.${unit.status}`)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {effectiveCount < filtered.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="flex h-10 w-full items-center justify-center gap-1.5 rounded-control border border-white/10 text-xs font-medium text-brand-400"
                    >
                      <ChevronUp className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                      {t("units.loadMore")}
                    </button>
                  )}
                </div>
              )}
            </div>

            {summaryBar}
          </>
        )}
      </div>
    </div>
  );
}
