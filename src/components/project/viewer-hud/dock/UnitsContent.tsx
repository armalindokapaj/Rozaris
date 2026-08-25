"use client";

import { forwardRef, Fragment, useEffect, useMemo, useRef, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { gsap } from "gsap";
import { Building2, Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { clamp, cn } from "@/lib/utils";
import { formatUnitArea } from "../../units-workspace/unitDisplay";
import {
  activeFilterCount,
  unitFacets,
  bedroomLabel,
  filterUnits,
  STATUS_DOT,
  type StatusFilter,
  type UnitFilterState,
} from "../../units-workspace/unitFilters";
import type { Unit } from "@/lib/types";
import { DOCK_MORPH_EASE, DOCK_MORPH_TIMING } from "../layoutState";
import { DockPopover } from "./DockPopover";
import type { DockPopoverId } from "./DockContent";

// Order + colors are a direct instruction (2026-08-18): "'Units' filtering
// system must include: a) All b) Available (Green color) c) Reserved
// (Orange Color) d) Sold (red color)" — "All" (previously missing here
// entirely) now leads, and each status pill gets the same colored dot
// `UnitSearchView.tsx`'s own filter pills and per-unit status rows already
// use (`STATUS_DOT`, moved to `unitFilters.ts` as a shared export so both
// surfaces read one real color scheme instead of two copies).
// Only the statuses a project's units actually use are rendered now
// (2026-08-25, "Show only whats in units … wasted space") — see
// `unitFacets`. "All" always leads, per the instruction above; the other
// three are this surface's ordering template, not the list itself.
const AVAILABILITY_PILL_ORDER: Exclude<StatusFilter, "all">[] = ["available", "reserved", "sold"];

/**
 * Morphing Bottom Dock Phase 2 (2026-08-18) — Units' content, redesigned
 * from `UnitsBar.tsx`'s own floating bar (left in place, unreferenced, per
 * the same convention Phase 1 already established for `ViewerNavigation
 * .tsx`/`SunTimeWorkspace.tsx`). That bar needed its own `min-h-[104px]`
 * because Surface/Bedrooms/Bathrooms each showed a "label above value/
 * control" two-line zone; the dock's one-shared-height rule (`layoutState
 * .ts`'s own doc comment) means those three become single-line popover
 * triggers instead — exactly the reuse `DockPopover.tsx`'s own doc comment
 * already predicted for this phase — so the whole row fits the shared
 * 62px height like every other mode's content does.
 *
 * `filters`/`onFiltersChange` is the same lifted `UnitFilterState` the old
 * bar read/wrote — every trigger here still genuinely narrows the real
 * unit list, not a disconnected copy (same reasoning `UnitsBar.tsx`'s own
 * doc comment gives). `listOpen`/`onToggleList` is still the real 380px
 * `UnitsWorkspace` side-panel toggle (`layoutState.ts`'s `unitsListOpen`),
 * unaffected by this rewrite — only the *filter bar* moved onto the dock.
 *
 * `openPopover`/`onTogglePopover`/`onClosePopover` come straight from
 * `ProjectViewerDock`'s own shared `DockPopoverId | null` state (see
 * `DockContent.tsx`'s own doc comment for why this component gets the
 * generalized pair directly instead of separate booleans) — at most one of
 * Surface/Rooms is ever open at once, and selecting a different module (or
 * Escape) closes whichever was open, same as Time's own single preset
 * popover. Bedrooms and Bathrooms share the one "Rooms" popover rather than
 * getting one each — see `optionList`'s/`roomsTrigger`'s own doc comments
 * below for the real measured-width problem a first draft with 2 separate
 * triggers ran into.
 *
 * Mobile is its own, deliberately taller layout (2026-08-18, direct
 * instruction: Nav's/Views' own mobile heights now match Time's, "'units'
 * [height] will be higher to fit all the filtering system properly") —
 * see the mobile branch's own doc comment near the bottom of this file for
 * what changed and why (full-width rows instead of desktop's compact
 * chip/trigger row, Surface's slider shown directly instead of behind a
 * tap).
 */
export const UnitsContent = forwardRef<
  HTMLDivElement,
  {
    isDesktop: boolean;
    units: Unit[];
    filters: UnitFilterState;
    onFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
    listOpen: boolean;
    onToggleList: () => void;
    /** Received but no longer rendered as an on-canvas button here
     * (2026-08-18 direct instruction: "remove back sign and text units") —
     * kept in the type for parity with `TimeContent`/`ViewsContent` (see
     * `TimeContent.tsx`'s own doc comment on its own `onBack`). */
    onBack: () => void;
    onClose: () => void;
    /** Mobile-only collapsible filter sheet (2026-08-24) — see the
     * `collapsibleRef` effect and the mobile branch's own doc comments
     * below. Desktop's single-row layout has nothing to collapse (its
     * whole point is fitting the shared 62px height), so both of these are
     * simply unread there. */
    filtersExpanded: boolean;
    onToggleFilters: () => void;
    openPopover: DockPopoverId | null;
    onTogglePopover: (id: DockPopoverId) => void;
    onClosePopover: () => void;
  }
>(function UnitsContent(
  {
    isDesktop,
    units,
    filters,
    onFiltersChange,
    listOpen,
    onToggleList,
    onClose,
    filtersExpanded,
    onToggleFilters,
    openPopover,
    onTogglePopover,
    onClosePopover,
  },
  ref
) {
  const { t } = useT();
  const { areaUnit } = useViewerPreferences();
  const reducedMotion = useEffectiveReducedMotion();

  const filteredCount = useMemo(() => filterUnits(units, filters).length, [units, filters]);

  const areaBounds = useMemo(() => {
    if (units.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const u of units) {
      if (u.area < min) min = u.area;
      if (u.area > max) max = u.area;
    }
    return min < max ? { min: Math.floor(min), max: Math.ceil(max) } : null;
  }, [units]);

  // Only the options this project's units actually justify — see
  // `unitFacets` for the two rules. Bathrooms was already derived this way
  // inline here; Bedrooms and Availability were still fixed lists, and are
  // now folded into the same shared derivation.
  const facets = useMemo(() => unitFacets(units, filters), [units, filters]);
  const availabilityPills = useMemo<StatusFilter[]>(
    () => (facets.statuses.length === 0 ? [] : ["all", ...AVAILABILITY_PILL_ORDER.filter((id) => facets.statuses.includes(id))]),
    [facets.statuses]
  );
  // Whether each composite control has anything left to offer. Rooms hosts
  // Bedrooms and Bathrooms in one popover, so it survives on either half;
  // Surface is already data-driven via `areaBounds` (null when every unit
  // shares one area) and only ever rendered an empty popover in that case.
  const hasBedrooms = facets.bedrooms.length > 0;
  const hasBathrooms = facets.bathrooms.length > 0;
  const hasRooms = hasBedrooms || hasBathrooms;
  const hasSurface = areaBounds != null;
  const hasAvailability = availabilityPills.length > 0;
  // A project can leave nothing worth filtering on at all (say a handful of
  // identical units). Mobile's collapse toggle then opens an empty drawer,
  // so it is dropped too.
  const hasAnyFilter = hasSurface || hasRooms || hasAvailability;

  // One per popover trigger, so `mousedown` on a trigger is not mistaken
  // for a click outside its own popover — see `DockPopover`'s own note.
  // Rooms has two because desktop and mobile render different triggers for
  // the same `unitsRooms` popover, and only one of them is ever mounted.
  const surfaceTriggerRef = useRef<HTMLButtonElement>(null);
  const roomsTriggerRef = useRef<HTMLButtonElement>(null);
  const roomsTriggerMobileRef = useRef<HTMLButtonElement>(null);

  // How many filters are actually narrowing the list right now — shown as a
  // badge on the mobile collapse toggle so the *collapsed* bar still says
  // whether anything is filtered, instead of hiding that behind a tap.
  // `activeFilterCount` deliberately excludes Availability (see its own doc
  // comment in `unitFilters.ts` — "all" vs "available" is a default flip,
  // not an "active filter" for the Clear-filters badge it was written for),
  // but the availability pills are one of the four controls this toggle
  // hides, so a non-default status is counted here on top of it.
  const hiddenFilterCount = activeFilterCount(filters) + (filters.status !== "all" ? 1 : 0);

  // Mobile filter sheet's own expand/collapse animation (2026-08-24, direct
  // instruction: "i dont want to let the 'filtering tab' to be visible
  // while rotating the building. it takes too much space while
  // navigating"). Deliberately animated here on the section itself rather
  // than through `ProjectViewerDock`'s own `morphTo` — that timeline only
  // ever runs on a *mode* change (nav ↔ units ↔ time ↔ views) and hands the
  // shell back to CSS `height: auto` when it lands, so a section tweening
  // its own height inside the shell is what the shell then follows, frame
  // by frame, for free.
  //
  // `autoAlpha` (not a bare opacity) is the load-bearing half: it resolves
  // to `visibility: hidden` at 0, which is what actually takes the
  // collapsed filters out of hit-testing *and* out of the tab order. A
  // height-0 + `overflow: hidden` box alone still leaves its children
  // focusable, which is the exact "hidden but still interactive" failure
  // the instruction above opens with.
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const prevExpandedRef = useRef(filtersExpanded);
  useEffect(() => {
    const el = collapsibleRef.current;
    // Desktop renders a different tree with no collapsible section at all
    // — nothing to animate, and clearing `mountedRef` here is what makes a
    // later resize back down into the mobile layout re-run the first-mount
    // branch below (which is the only thing that applies the collapsed
    // state without an animation).
    if (!el) {
      mountedRef.current = false;
      return;
    }
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevExpandedRef.current = filtersExpanded;
      // First paint of the mobile layout: land on the right state
      // instantly. The dock's own mount morph measures this content's real
      // `scrollHeight` right after, so an animation running here would be
      // measured mid-flight.
      if (!filtersExpanded) gsap.set(el, { height: 0, overflow: "hidden", autoAlpha: 0 });
      return;
    }
    if (prevExpandedRef.current === filtersExpanded) return;
    prevExpandedRef.current = filtersExpanded;

    gsap.killTweensOf(el);
    const duration = reducedMotion ? 0.001 : DOCK_MORPH_TIMING.containerMorph;
    if (filtersExpanded) {
      gsap.set(el, { overflow: "hidden" });
      // Measured while the element is still collapsed — `scrollHeight`
      // reports the real content height regardless of the box's own
      // clamped `height`, so this needs no reflow dance to read.
      const target = el.scrollHeight;
      gsap.fromTo(
        el,
        { height: 0, autoAlpha: 0 },
        {
          height: target,
          autoAlpha: 1,
          duration,
          ease: DOCK_MORPH_EASE,
          // Hands sizing back to plain CSS the instant the tween lands, so
          // a later in-place reflow (a longer translated string, the
          // Rooms summary changing) isn't fighting a frozen pixel height —
          // same handoff `ProjectViewerDock.tsx`'s own width/height tweens
          // already make.
          onComplete: () => gsap.set(el, { clearProps: "height,overflow,visibility,opacity" }),
        }
      );
    } else {
      gsap.set(el, { overflow: "hidden", height: el.getBoundingClientRect().height });
      gsap.to(el, { height: 0, autoAlpha: 0, duration, ease: DOCK_MORPH_EASE });
    }
    // `isDesktop` isn't read in the body but *is* what decides whether
    // `collapsibleRef` points at anything at all — without it here, a
    // resize across the 1024px split while collapsed would remount the
    // mobile section fully expanded, since neither other dep changed.
  }, [filtersExpanded, reducedMotion, isDesktop]);

  const effMin = areaBounds ? clamp(filters.minArea ?? areaBounds.min, areaBounds.min, areaBounds.max) : 0;
  const effMax = areaBounds ? clamp(filters.maxArea ?? areaBounds.max, areaBounds.min, areaBounds.max) : 0;
  const areaGap = areaBounds ? Math.max(1, Math.round((areaBounds.max - areaBounds.min) * 0.02)) : 1;

  function handleMinAreaChange(e: ChangeEvent<HTMLInputElement>) {
    if (!areaBounds) return;
    const raw = clamp(Number(e.target.value), areaBounds.min, effMax - areaGap);
    onFiltersChange((prev) => ({ ...prev, minArea: raw <= areaBounds.min ? null : raw }));
  }
  function handleMaxAreaChange(e: ChangeEvent<HTMLInputElement>) {
    if (!areaBounds) return;
    const raw = clamp(Number(e.target.value), effMin + areaGap, areaBounds.max);
    onFiltersChange((prev) => ({ ...prev, maxArea: raw >= areaBounds.max ? null : raw }));
  }

  const fillLeftPct = areaBounds ? ((effMin - areaBounds.min) / (areaBounds.max - areaBounds.min)) * 100 : 0;
  const fillRightPct = areaBounds ? 100 - ((effMax - areaBounds.min) / (areaBounds.max - areaBounds.min)) * 100 : 0;
  const minThumbOnTop = areaBounds ? (effMin - areaBounds.min) / (areaBounds.max - areaBounds.min) > 0.5 : false;

  // Purple × — see `TimeContent.tsx`'s own doc comment on its identical
  // `closeButton` for the direct instruction this matches.
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("common.close")}
      title={t("common.close")}
      className="flex shrink-0 items-center rounded-control px-1.5 text-brand-400 transition-colors hover:text-brand-300"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // Title zone doubles as the real "List Units" trigger, same as the old
  // bar's own. Condensed twice over from that bar's own two-line badge-
  // plus-subtitle treatment: Phase 2's first draft was icon + "Filter
  // List" + the full `units.foundCount` sentence ("40 units found") on one
  // line, which — measured directly via a manual DOM width probe, the
  // same technique `ProjectViewerDock.tsx`'s own `morphTo` now uses
  // internally — made this row's own true natural width ~1125px, wider
  // than the smallest desktop viewport this codebase supports at all
  // (`useIsDesktop`'s 1024px floor, ~992px of usable width once padding's
  // subtracted). A bare numeric badge (no `units.foundCount` sentence,
  // no i18n key needed — it's just digits) keeps the live count visible
  // at a glance without the words.
  const listTrigger = (
    <button
      type="button"
      onClick={onToggleList}
      aria-pressed={listOpen}
      aria-label={`${t("units.listUnits")} — ${t("units.foundCount", { count: filteredCount })}`}
      title={t("units.listUnits")}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-control px-1.5 text-sm font-medium transition-colors",
        listOpen ? "text-brand-400" : "text-white hover:text-brand-300"
      )}
    >
      <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t("units.filterListLabel")}
      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white/70" aria-hidden="true">
        {filteredCount}
      </span>
    </button>
  );

  // Shared dual-thumb slider markup — Surface's own popover content on
  // desktop, and (see `surfaceRowMobile` below) rendered directly inline
  // on mobile instead of behind a popover. One real control either way,
  // just two different places to put it.
  const surfaceSlider = areaBounds ? (
    <div className="relative flex h-5 items-center">
      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/10" />
      <div
        className="pointer-events-none absolute h-1.5 rounded-full bg-brand-400"
        style={{ left: `${fillLeftPct}%`, right: `${fillRightPct}%` }}
      />
      <input
        type="range"
        min={areaBounds.min}
        max={areaBounds.max}
        value={effMin}
        onChange={handleMinAreaChange}
        aria-label={`${t("units.filterSurface")} minimum`}
        className="rz-range-thumb"
        style={{ zIndex: minThumbOnTop ? 5 : 3 }}
      />
      <input
        type="range"
        min={areaBounds.min}
        max={areaBounds.max}
        value={effMax}
        onChange={handleMaxAreaChange}
        aria-label={`${t("units.filterSurface")} maximum`}
        className="rz-range-thumb"
        style={{ zIndex: minThumbOnTop ? 3 : 4 }}
      />
    </div>
  ) : (
    <div className="flex h-5 items-center" aria-hidden="true">
      <div className="h-1.5 w-full rounded-full bg-white/10" />
    </div>
  );

  const surfaceLabel = areaBounds ? `${formatUnitArea(effMin, areaUnit)} – ${formatUnitArea(effMax, areaUnit)}` : t("common.any");
  const surfaceTrigger = (
    <div className="relative flex shrink-0 items-center">
      <button
        ref={surfaceTriggerRef}
        type="button"
        onClick={() => onTogglePopover("unitsSurface")}
        aria-haspopup="dialog"
        aria-expanded={openPopover === "unitsSurface"}
        disabled={!areaBounds}
        className="flex items-center gap-1.5 rounded-control px-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="text-white/50">{t("units.filterSurface")}</span>
        {surfaceLabel}
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-white/50 transition-transform", openPopover === "unitsSurface" && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <DockPopover
        open={openPopover === "unitsSurface"}
        onClose={onClosePopover}
        triggerRef={surfaceTriggerRef}
        anchorClassName="left-0 w-56"
      >
        {areaBounds && (
          <div className="flex flex-col gap-2 px-1.5 py-1">
            {surfaceSlider}
            <div className="flex items-center justify-between text-xs font-semibold tabular-nums text-white">
              <span>{formatUnitArea(effMin, areaUnit)}</span>
              <span>{formatUnitArea(effMax, areaUnit)}</span>
            </div>
          </div>
        )}
      </DockPopover>
    </div>
  );

  // One column of a `roomsTrigger` popover — extracted rather than a
  // second standalone trigger (below) specifically because measuring the
  // real, live-rendered row (see `roomsTrigger`'s own doc comment) showed
  // Bedrooms and Bathrooms as two *separate* triggers pushed this row's
  // true natural width to ~1125px, past the smallest desktop viewport this
  // codebase supports at all.
  function optionList(label: string, value: number | null, options: number[], formatOption: (v: number) => string, onChange: (v: number | null) => void) {
    return (
      <div className="flex min-w-[112px] flex-1 flex-col gap-0.5" role="menu" aria-label={label}>
        <span className="px-2.5 pt-1 text-[11px] uppercase tracking-wide text-white/40">{label}</span>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={value == null}
          onClick={() => onChange(null)}
          className={cn(
            "flex items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
            value == null ? "bg-brand-500/10 text-brand-400" : "text-white/75 hover:bg-white/5 hover:text-white"
          )}
        >
          <span className="flex-1">{t("common.any")}</span>
          {value == null && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        </button>
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <button
              key={opt}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              onClick={() => onChange(opt)}
              className={cn(
                "flex items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                isActive ? "bg-brand-500/10 text-brand-400" : "text-white/75 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="flex-1">{formatOption(opt)}</span>
              {isActive && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );
  }

  // Bedrooms + Bathrooms share one "Rooms ▾" trigger/popover (Phase 2's
  // first draft gave each its own trigger — see `optionList`'s own doc
  // comment for the real measured-width problem that caused this merge).
  // Summary label shows whichever half is actually narrowed (bedrooms,
  // bathrooms, both joined, or the field's own name when neither is set) —
  // still legible at a glance without needing 2 separate zones for it.
  const roomsLabelParts: string[] = [];
  if (filters.bedrooms != null) roomsLabelParts.push(bedroomLabel(filters.bedrooms));
  if (filters.bathrooms != null) roomsLabelParts.push(`${filters.bathrooms} ${t("units.filterBathrooms").toLowerCase()}`);
  const roomsSummary = roomsLabelParts.length > 0 ? roomsLabelParts.join(" · ") : t("common.any");

  // Per-field summaries — mobile's own trigger (below) shows Bedrooms and
  // Bathrooms as two divided halves instead of desktop's one merged
  // "Rooms" line (2026-08-18 direct instruction: "have 'Bedrooms' and
  // 'Bathrooms' divided space in the middle where it reads 'Rooms'"), so
  // each half needs its own value independent of `roomsSummary` above
  // (which stays desktop-only, unchanged).
  const bedroomsSummary = filters.bedrooms != null ? bedroomLabel(filters.bedrooms) : t("common.any");
  const bathroomsSummary = filters.bathrooms != null ? String(filters.bathrooms) : t("common.any");

  const roomsTrigger = (
    <div className="relative flex shrink-0 items-center">
      <button
        ref={roomsTriggerRef}
        type="button"
        onClick={() => onTogglePopover("unitsRooms")}
        aria-haspopup="menu"
        aria-expanded={openPopover === "unitsRooms"}
        className="flex items-center gap-1.5 rounded-control px-2 text-sm font-medium text-white transition-colors"
      >
        <span className="text-white/50">{t("units.filterRooms")}</span>
        {roomsSummary}
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-white/50 transition-transform", openPopover === "unitsRooms" && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <DockPopover
        open={openPopover === "unitsRooms"}
        onClose={onClosePopover}
        triggerRef={roomsTriggerRef}
        anchorClassName="left-0 flex gap-1"
      >
        {hasBedrooms &&
          optionList(t("units.filterBedrooms"), filters.bedrooms, facets.bedrooms, bedroomLabel, (v) =>
            onFiltersChange((prev) => ({ ...prev, bedrooms: v }))
          )}
        {hasBedrooms && hasBathrooms && <span className="my-1 w-px shrink-0 bg-white/10" aria-hidden="true" />}
        {hasBathrooms &&
          optionList(t("units.filterBathrooms"), filters.bathrooms, facets.bathrooms, (v) => String(v), (v) =>
            onFiltersChange((prev) => ({ ...prev, bathrooms: v }))
          )}
      </DockPopover>
    </div>
  );

  // Function, not a plain JSX const — same "each call site owns its own
  // wrapper className" shape `UnitsBar.tsx`'s own original mobile-vs-
  // desktop `availabilityPills(extraClassName)` used, needed here for the
  // same reason: desktop's row wants compact `shrink-0` pills, mobile's
  // own row (below) wants 3 equal-width `flex-1` pills spanning the full
  // row — 2 genuinely different layouts around the identical buttons, not
  // something one static wrapper div could flex between.
  function renderAvailabilityPills(wrapperClassName: string) {
    return (
      <div className={wrapperClassName}>
        {availabilityPills.map((id) => {
          const isActive = filters.status === id;
          const dotClass = id === "all" ? null : STATUS_DOT[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onFiltersChange((prev) => ({ ...prev, status: id }))}
              aria-pressed={isActive}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors",
                isActive ? "bg-brand-500 text-white" : "border border-white/15 text-white/75 hover:border-white/25 hover:text-white"
              )}
            >
              {dotClass && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} aria-hidden="true" />}
              {t(`units.status.${id}`)}
            </button>
          );
        })}
      </div>
    );
  }

  const divider = <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />;

  // Mobile-only full-width row variants (direct instruction, 2026-08-18:
  // "'units' height will be higher to fit all the filtering system
  // properly") — Phase 2's first mobile draft condensed everything into
  // the same compact single-line triggers desktop uses, just wrapped onto
  // extra lines when they didn't fit (`flex-wrap`, still used for the
  // Rooms row below). That's a reasonable *desktop* shape (space is
  // actually scarce there — see `DOCK_DIMENSIONS.units`'s own doc
  // comment), but on mobile there's no reason to keep filters compact:
  // this trades the compact chip/trigger row for one real full-width row
  // per control, each with a proper touch target, rather than several
  // small triggers packed edge to edge. Surface goes further still —
  // its slider renders directly on this row (`surfaceSlider`, the exact
  // same control desktop's own popover uses) instead of behind a tap,
  // since mobile has the vertical room to just show it. Rooms keeps its
  // popover (tapping it still opens the same 2-column Bedrooms/Bathrooms
  // list `roomsTrigger` does above) — full-width row here just means a
  // bigger, clearer trigger, not a different interaction.
  // × folded into this same row, next to the count badge (2026-08-18
  // direct instruction: "Filter List number (68 now) moves more to the
  // left and the X button goes to the number (68) to have more space at
  // the top") — same "fold × into the existing content row instead of its
  // own header row" move already made for Time's/Views' mobile rows this
  // session. The badge no longer sits on a `flex-1` label pushing it to
  // the button's far right edge; the label is `shrink-0` now so icon +
  // label + badge sit grouped together right after each other, then the
  // trigger button itself is `flex-1` to keep spanning most of the row,
  // with × as a real sibling (not nested — a button-in-a-button isn't
  // valid markup) at the true end of the row.
  // Mobile-only (2026-08-24, direct instruction: "i dont want to let the
  // 'filtering tab' to be visible while rotating the building. it takes too
  // much space while navigating") — Units' full mobile filter stack is
  // 249px tall on a 390×844 phone, over a third of the viewport, and it sat
  // permanently open for as long as Units was the active module, covering
  // the lower third of the building the visitor was trying to orbit. This
  // folds it away without leaving Units: the filters stay applied, the 3D
  // unit blocks stay live, only the controls' own footprint goes. Any
  // pointer-down on the 3D canvas collapses it automatically (see
  // `ProjectViewerRuntime.tsx`'s own `handleScenePointerDown`), so
  // rotating never has to be preceded by dismissing anything.
  //
  // Deliberately *not* the outside-click-closes-the-module handler this
  // HUD already tried and removed once (see `ViewerHUD.tsx`'s own note on
  // it): that one read a drag's `mousedown` as "outside" and dropped the
  // visitor all the way back to Navigation mid-orbit. Collapsing on the
  // same gesture is the opposite trade — nothing is lost, and re-opening
  // is this one tap rather than re-entering the module from the nav.
  const filtersToggleMobile = (
    <button
      type="button"
      onClick={onToggleFilters}
      aria-expanded={filtersExpanded}
      aria-controls="viewer-units-filters"
      aria-label={t("units.filtersToggle")}
      className={cn(
        "flex h-11 shrink-0 items-center gap-1.5 rounded-control border px-3 text-sm font-medium transition-colors",
        filtersExpanded ? "border-brand-400/50 bg-brand-500/10 text-brand-400" : "border-white/15 text-white hover:border-white/25"
      )}
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
      {hiddenFilterCount > 0 && (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
            filtersExpanded ? "bg-brand-500/20 text-brand-300" : "bg-white/10 text-white/70"
          )}
          aria-hidden="true"
        >
          {hiddenFilterCount}
        </span>
      )}
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 transition-transform", filtersExpanded && "rotate-180")}
        aria-hidden="true"
      />
    </button>
  );

  // The one row that is *always* on screen in Units mode on mobile — the
  // collapse toggle added to it (2026-08-24) is what lets everything below
  // it fold away, so it can never itself live inside the collapsible
  // section. `min-w-0` + `truncate` on the label (was `shrink-0`) because
  // this row now carries a third control: "Filter List" is the longest
  // string here and the one locale-sensitive one ("Lista e Filtrave" is
  // ~33px wider than the English — see `layoutState.ts`'s own EN-vs-SQ
  // measurement table), so it is the piece that gives, rather than letting
  // a long translation push × off the row.
  const listTriggerMobile = (
    <div className="flex h-11 w-full items-center gap-2">
      <button
        type="button"
        onClick={onToggleList}
        aria-pressed={listOpen}
        aria-label={`${t("units.listUnits")} — ${t("units.foundCount", { count: filteredCount })}`}
        className={cn(
          "flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors",
          listOpen ? "border-brand-400/50 bg-brand-500/10 text-brand-400" : "border-white/15 text-white hover:border-white/25"
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-left">{t("units.filterListLabel")}</span>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">{filteredCount}</span>
      </button>
      {hasAnyFilter && filtersToggleMobile}
      {closeButton}
    </div>
  );

  // Two divided halves instead of one merged "Rooms ▾ <summary>" line
  // (2026-08-18 direct instruction: "have 'Bedrooms' and 'Bathrooms'
  // divided space in the middle where it reads 'Rooms'. careful with the
  // dropdown menu filtering system.") — still one real `<button>`/one real
  // `unitsRooms` popover underneath (the "careful with the dropdown" part):
  // both halves are plain `<span>`s inside the same clickable button, not
  // two separate triggers, so the exact same shared-popover wiring
  // `roomsTrigger`'s own doc comment above documents (merged specifically
  // to avoid a real measured-width problem two independent triggers hit)
  // is untouched — this only changes what the *closed* trigger's own face
  // shows.
  const roomsTriggerMobile = (
    <div className="relative flex w-full items-center">
      <button
        ref={roomsTriggerMobileRef}
        type="button"
        onClick={() => onTogglePopover("unitsRooms")}
        aria-haspopup="menu"
        aria-expanded={openPopover === "unitsRooms"}
        className="flex h-11 w-full items-stretch rounded-control border border-white/15 text-sm font-medium text-white transition-colors hover:border-white/25"
      >
        {/* Each half is dropped when the project has nothing to offer for
            it, so a project whose units all have the same bathroom count
            gets a full-width Bedrooms trigger rather than half a control
            plus a dead "Bathrooms — Any" half. */}
        {hasBedrooms && (
          <span className="flex flex-1 flex-col items-start justify-center gap-0.5 px-3 text-left">
            <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterBedrooms")}</span>
            <span className="text-xs font-semibold text-white">{bedroomsSummary}</span>
          </span>
        )}
        {hasBedrooms && hasBathrooms && <span className="my-2 w-px shrink-0 bg-white/15" aria-hidden="true" />}
        {hasBathrooms && (
          <span className="flex flex-1 flex-col items-start justify-center gap-0.5 px-3 text-left">
            <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterBathrooms")}</span>
            <span className="text-xs font-semibold text-white">{bathroomsSummary}</span>
          </span>
        )}
        <ChevronDown
          className={cn("mr-3 h-3.5 w-3.5 shrink-0 self-center text-white/50 transition-transform", openPopover === "unitsRooms" && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {/* `inset-x-0` (not desktop's own `left-0`) — real alignment bug
          found live-testing (2026-08-18 direct instruction: "Different
          dropdown for Bedrooms and different dropdown for bathrooms. fix
          the dropdown alignment again."): `left-0` only pins the
          popover's *left* edge, so its own intrinsic (`min-content`)
          width — sized just to fit its two option columns, ~230px — left
          it far narrower than this `w-full` trigger's real width once the
          trigger grew into the two-halves layout above, reading as a
          small floating box disconnected from the "Bathrooms" half on the
          trigger's right side entirely. `inset-x-0` stretches the popover
          to the trigger's own full width instead, so each `optionList`'s
          existing `flex-1` (same as `roomsTrigger`'s desktop popover
          already had, unused until now because that popover was never
          full-width) splits it into two halves landing directly under the
          matching "Bedrooms"/"Bathrooms" half above — same one shared
          popover/filtering wiring, unchanged (the "careful with the
          dropdown" part). */}
      <DockPopover
        open={openPopover === "unitsRooms"}
        onClose={onClosePopover}
        triggerRef={roomsTriggerMobileRef}
        anchorClassName="inset-x-0 flex gap-1"
      >
        {hasBedrooms &&
          optionList(t("units.filterBedrooms"), filters.bedrooms, facets.bedrooms, bedroomLabel, (v) =>
            onFiltersChange((prev) => ({ ...prev, bedrooms: v }))
          )}
        {hasBedrooms && hasBathrooms && <span className="my-1 w-px shrink-0 bg-white/10" aria-hidden="true" />}
        {hasBathrooms &&
          optionList(t("units.filterBathrooms"), filters.bathrooms, facets.bathrooms, (v) => String(v), (v) =>
            onFiltersChange((prev) => ({ ...prev, bathrooms: v }))
          )}
      </DockPopover>
    </div>
  );

  if (isDesktop) {
    // Built as a list and interleaved rather than written out with literal
    // `{divider}`s between fixed children: any of Surface/Rooms/
    // Availability can now be absent for a given project (see `unitFacets`),
    // and hardcoded separators would leave a double divider — or a leading
    // one against the close button — wherever a control dropped out.
    const zones = [
      listTrigger,
      hasSurface ? surfaceTrigger : null,
      hasRooms ? roomsTrigger : null,
      hasAvailability ? renderAvailabilityPills("flex shrink-0 items-center gap-1.5") : null,
      closeButton,
    ].filter(Boolean);
    return (
      <div ref={ref} className="flex h-full w-full items-center gap-2 px-3.5 sm:px-4">
        {zones.map((zone, i) => (
          <Fragment key={i}>
            {i > 0 && divider}
            {zone}
          </Fragment>
        ))}
      </div>
    );
  }

  // No `overflow-x-auto`/`overflow-y` anywhere in this branch — real bug
  // found live-testing on a real mobile viewport: `overflow-x-auto` alone
  // triggers a genuine CSS gotcha (leaving `overflow-y` at its default
  // "visible" while `overflow-x` is anything else silently coerces *that*
  // axis to "auto" too, both have to agree once either leaves "visible"),
  // which clipped Rooms' own upward-opening `DockPopover` to invisible —
  // `boundingBox()` still reported plausible on-screen coordinates for it
  // (absolute positioning is still computed even while clipped), so this
  // only surfaced as a real tap landing on the 3D canvas underneath
  // instead, the same silent-clipping signature `DockShell`'s own
  // `overflow-hidden` bug had earlier this session. Every row here is a
  // plain full-width block instead (no scrolling, no wrapping needed),
  // which sidesteps the whole bug class rather than working around it.
  // `min-h-[70px]` matches `DOCK_HEIGHT_MOBILE_STANDARD` (the same floor
  // Nav/Views already apply, +`DockShell`'s own 2px border = the shared
  // 72px shell) so the *collapsed* Units dock is exactly the same size as
  // every other mode's, rather than a fourth slightly-different height —
  // it's a floor, so the expanded state still grows past it freely.
  //
  // The gap that used to sit on this column (`gap-3`) moved *inside* the
  // collapsible section below: a parent gap is still applied to a
  // zero-height child, so it would have left a 12px strip of empty dock
  // under the bar while collapsed.
  return (
    <div ref={ref} className="flex min-h-[70px] w-full flex-col px-4 py-3">
      {listTriggerMobile}
      <div ref={collapsibleRef} id="viewer-units-filters">
        <div className="flex flex-col gap-3 pt-3">
          {hasSurface && (
            <div className="flex flex-col gap-1.5 rounded-control border border-white/15 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterSurface")}</span>
                <span className="text-xs font-semibold tabular-nums text-white">{surfaceLabel}</span>
              </div>
              {surfaceSlider}
            </div>
          )}
          {hasRooms && roomsTriggerMobile}
          {hasAvailability &&
            renderAvailabilityPills("flex items-stretch gap-2 [&>button]:flex-1 [&>button]:justify-center [&>button]:py-2.5")}
        </div>
      </div>
    </div>
  );
});
