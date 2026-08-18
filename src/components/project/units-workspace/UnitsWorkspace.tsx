"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { gsap } from "gsap";
import { ArrowLeft, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useAppStore } from "@/lib/store";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import type { Unit } from "@/lib/types";
import { UnitSearchView, UNITS_PAGE_SIZE } from "./UnitSearchView";
import { UnitDetailView } from "./UnitDetailView";
import type { UnitFilterState } from "./unitFilters";

/** PRD §4 — "Recommended desktop width: 360–420px... large displays ~28–
 * 32% max viewport width." Fixed for Phase 1 rather than the responsive
 * vw-clamped version — real search/filter content (Phase 2) is what
 * actually needs to know its available width precisely; the empty shell
 * doesn't, and a fixed value keeps the resize choreography below
 * (ResizeObserver-driven, see the module doc comment) simple to reason
 * about for this first pass. */
const PANEL_WIDTH = 380;

/**
 * Units Search Mode PRD (2026-08-16) — real content: Phase 2 (search/
 * filter/sort/list, `UnitSearchView`, over real Postgres units — see
 * `units` prop) and Phase 4 (`UnitDetailView`, swapped in on row click)
 * both live in this same panel container, matching the Unit Detail PRD's
 * own §1 rule ("never a second or middle panel") — this component owns
 * `selectedUnit` and branches both the header (UNITS vs "← Back to
 * Search") and the body between the two views. Phase 3's list→3D half
 * (`onSelectUnitIn3D`, called on every select/back/close) is real too —
 * see RenderEngine.setSelectedUnit's own doc comment for what it does and
 * why it's a safe no-op on a project with no real unit mesh links yet.
 * The 3D→list half (clicking a unit's mesh in the viewport) isn't built —
 * no raycasting/pointer-picking exists anywhere in RenderEngine yet, a
 * real new system rather than plumbing, flagged rather than faked.
 *
 * `units` comes from the parent (ProjectViewerRuntime's own useProjectUnits call)
 * rather than being fetched here — it's also fed into `detailModelEntries`
 * for the 3D scene's own unit-status boxes, so one fetch serves both.
 *
 * Favorites live here (not inside UnitSearchView) so the heart state
 * stays in sync between the list and a unit's own detail view — local
 * component state, not the app's global Saved-listings store: real Unit
 * rows from this project aren't Listing records that store would
 * recognize.
 *
 * `filters` is now a controlled prop (Units Bar redesign, 2026-08-17) —
 * owned by ProjectViewerRuntime, not this component, so the new floating
 * UnitsBar (a sibling of this panel, rendered inside ViewerHUD) can share
 * and mutate the exact same filter state. `viewMode`/`visibleCount` stay
 * local; nothing outside this panel needs them yet.
 *
 * Two-layer slide (PRD §5 Step 1, `translateX(-100%) → 0`, 400–550ms):
 * the *outer* div's `width` is what's actually tweened 0→380px — a real
 * layout-affecting animation, deliberately, because it's a flex sibling
 * of the 3D viewport wrapper in ProjectViewerRuntime, so every frame of this
 * tween reflows that sibling narrower, which RenderEngine's own
 * ResizeObserver (already in place, unrelated to this PRD) picks up on
 * its own — camera aspect, renderer size, and post-processing all follow
 * automatically. No new RenderEngine code needed for PRD §5 Step 2's
 * "renderer updates width/aspect/projection/post-processing" requirement.
 * The *inner* div stays a constant `PANEL_WIDTH` and is what actually
 * gets `translateX`-slid — keeps panel content from visibly reflowing/
 * squishing while the outer clip window is mid-grow, so the visual read
 * stays "sliding in from off-screen" rather than "wiping into view".
 */
export function UnitsWorkspace({
  open,
  onClose,
  units,
  onSelectUnitIn3D,
  filters,
  onFiltersChange,
}: {
  open: boolean;
  onClose: () => void;
  units: Unit[];
  onSelectUnitIn3D: (unitId: string | null) => void;
  filters: UnitFilterState;
  onFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Search/sort/view state — stays local (survives UnitSearchView
  // unmounting when a unit is selected, see UnitSearchView's own doc
  // comment); `filters` itself is a controlled prop now, shared with
  // UnitsBar (see this component's own doc comment).
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [visibleCount, setVisibleCount] = useState(UNITS_PAGE_SIZE);
  // More / Settings Menu PRD §11-12 — Currency reuses the real platform
  // preference (useAppStore); Area Units is viewer-local (useViewerPreferences).
  const displayCurrency = useAppStore((s) => s.currency);
  const eurToAllRate = useAppStore((s) => s.eurToAllRate);
  const { areaUnit } = useViewerPreferences();

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const dur = reducedMotion ? 0.001 : open ? 0.48 : 0.4;
    const ease = open ? "power2.out" : "power2.in";
    // Opening only waits (2026-08-18 direct instruction: "the dock folds
    // from the sides to the middle... after the dock fades with a 250ms
    // time then the 'filter list panel' slides from the left") — the
    // dock's own fold-out (ViewerHUD.tsx's `navRef` effect) takes exactly
    // 250ms with no delay of its own, so this panel starting 250ms late is
    // what makes the two read as one sequenced handoff rather than two
    // things happening at once. Closing has no delay (starts the instant
    // `open` goes false) — the dock's own restore is what waits on *this*
    // animation's duration instead (see that effect's own doc comment for
    // why 0.4s, not 0.25s, is what it waits for).
    const delay = open && !reducedMotion ? 0.25 : 0;
    const tl = gsap.timeline({ delay });
    tl.to(outer, { width: open ? PANEL_WIDTH : 0, duration: dur, ease }, 0).to(
      inner,
      { x: open ? 0 : -PANEL_WIDTH, duration: dur, ease },
      0
    );
    return () => {
      tl.kill();
    };
  }, [open, reducedMotion]);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectUnit(unit: Unit) {
    setSelectedUnit(unit);
    onSelectUnitIn3D(unit.id);
  }

  function handleBackToSearch() {
    setSelectedUnit(null);
    onSelectUnitIn3D(null);
  }

  function handleClose() {
    setSelectedUnit(null);
    onSelectUnitIn3D(null);
    onClose();
  }

  return (
    <div
      ref={outerRef}
      className="relative h-full shrink-0 overflow-hidden"
      style={{ width: 0 }}
      aria-hidden={!open}
    >
      <div
        ref={innerRef}
        className="viewer-glass absolute inset-y-0 left-0 flex h-full flex-col"
        // `.viewer-glass`'s border is declared unlayered (see globals.css)
        // specifically so it beats same-specificity Tailwind utilities —
        // which means Tailwind border-*-0 classes can't zero out 3 of its
        // 4 sides here; only an inline style outranks it. Left edge is the
        // screen edge and top/bottom are full-height, so only the right
        // edge (PRD §4's "subtle separator between Units UI and Viewer")
        // should actually show a border.
        style={{
          width: PANEL_WIDTH,
          transform: "translateX(-100%)",
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
        }}
      >
        {/* PRD §10 — "UNITS  ×" for the search view; Unit Detail PRD §1's
            same panel gets its own "← Back to Search" header instead once
            a unit is selected, per that PRD's own rule of never opening a
            second panel. `×` always fully closes Units mode (§31: same as
            clicking the Units nav icon again). */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5">
          {selectedUnit ? (
            <button
              type="button"
              onClick={handleBackToSearch}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("units.backToSearch")}
            </button>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{t("units.title")}</span>
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("units.close")}
            title={t("units.close")}
            className="flex h-8 w-8 items-center justify-center rounded-control text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {selectedUnit ? (
          <UnitDetailView
            unit={selectedUnit}
            isFavorite={favorites.has(selectedUnit.id)}
            onToggleFavorite={() => toggleFavorite(selectedUnit.id)}
            displayCurrency={displayCurrency}
            eurToAllRate={eurToAllRate}
            areaUnit={areaUnit}
          />
        ) : (
          <UnitSearchView
            units={units}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onSelectUnit={handleSelectUnit}
            filters={filters}
            onFiltersChange={onFiltersChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            visibleCount={visibleCount}
            onVisibleCountChange={setVisibleCount}
            displayCurrency={displayCurrency}
            eurToAllRate={eurToAllRate}
            areaUnit={areaUnit}
          />
        )}
      </div>
    </div>
  );
}
