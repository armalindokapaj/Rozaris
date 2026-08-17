"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { gsap } from "gsap";
import { Building2, ChevronDown, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { clamp, cn } from "@/lib/utils";
import { formatUnitArea } from "./unitDisplay";
import { BEDROOM_OPTIONS, bedroomLabel, filterUnits, type StatusFilter, type UnitFilterState } from "./unitFilters";
import type { Unit } from "@/lib/types";
import type { ActiveModule } from "../viewer-hud/types";

const AVAILABILITY_PILLS: StatusFilter[] = ["available", "reserved", "sold"];

/** Mobile bottom-sheet's own dropdown — a full bordered box (44px touch
 * target, matches the reference render's Bedrooms/Bathrooms rectangles),
 * not `CompactFilterSelect`'s compact "label above value" text trigger.
 * Opens *downward* (unlike `CompactFilterSelect`): the sheet already has
 * real room below each dropdown (they sit above the Availability row, not
 * flush against the sheet's own bottom edge), and this sheet's own
 * container carries no `overflow-hidden` — the exact real bug
 * `CompactFilterSelect` hit and had it removed for (see the desktop bar's
 * own doc comment below) — so nothing would clip it either way. */
function MobileFilterSelect({
  label,
  value,
  options,
  formatOption,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  formatOption: (v: number) => string;
  onChange: (v: number | null) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value == null ? t("common.any") : formatOption(value)}`}
        className="flex h-11 items-center justify-between rounded-control border border-white/15 bg-white/5 px-3 text-sm font-medium text-white"
      >
        {value == null ? t("common.any") : formatOption(value)}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="viewer-glass absolute top-[calc(100%+6px)] left-0 right-0 z-10 rounded-panel p-1.5">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded-control px-3 py-2 text-left text-sm font-medium transition-colors",
              value == null ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            {t("common.any")}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-control px-3 py-2 text-left text-sm font-medium transition-colors",
                value === opt ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {formatOption(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Real, per-unit dropdown built for this bar's compact `label above value`
 * zone shape — distinct from UnitSearchView's own `FilterDropdown` (which
 * assumes a taller pill trigger with a border) and not shared with it, same
 * "no shared useDropdown hook" reasoning UnitSearchView's own doc comment
 * already gives (this codebase's react-hooks/refs lint rule rejects it);
 * each call site owns its own ref/state instead. Opens *upward* like
 * SunTimeWorkspace's dateMenuCompact — this bar already floats just above
 * the bottom nav, so a downward panel would collide with it. Desktop only —
 * see `MobileFilterSelect` below for the mobile sheet's own bordered-box
 * variant. */
function CompactFilterSelect({
  label,
  value,
  options,
  formatOption,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  formatOption: (v: number) => string;
  onChange: (v: number | null) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative flex shrink-0 flex-col justify-center gap-1 px-3.5 sm:px-4">
      <span className="whitespace-nowrap text-[11px] text-white/50">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value == null ? t("common.any") : formatOption(value)}`}
        className="flex items-center gap-1.5 text-sm font-medium text-white"
      >
        {value == null ? t("common.any") : formatOption(value)}
        <ChevronDown className={cn("h-3.5 w-3.5 text-white/50 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="viewer-glass absolute bottom-[calc(100%+8px)] left-0 z-10 w-32 rounded-panel p-1.5">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded-control px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              value == null ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            {t("common.any")}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded-control px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                value === opt ? "bg-brand-500/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              {formatOption(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Units Bar (direct design reference, 2026-08-17) — replaces what used to
 * happen the instant "Units" was clicked (the real 380px UnitsWorkspace
 * panel sliding open immediately). Now clicking Units opens this floating
 * bar instead, sharing ViewsWorkspace/SunTimeWorkspace's own visual
 * language (`viewer-glass` + `rounded-panel` + purple ring, `h-[60px]`,
 * title-zone-then-dividers layout) — and the real panel only opens once
 * the visitor explicitly clicks the title zone itself ("List Units"),
 * wired to `onToggleList` → `unitsListOpen` in ArchVizClient →
 * `getViewerLayoutState`'s new third input (see that module's doc
 * comment).
 *
 * `filters` is the same `UnitFilterState` UnitsWorkspace/UnitSearchView
 * already read/write (lifted one level further up, to ArchVizClient, so
 * this sibling bar can share it) — every control here (Surface/Bedrooms/
 * Bathrooms/Availability) genuinely narrows the real left-panel list, not
 * a disconnected copy. Two fields are new on `UnitFilterState` itself,
 * added alongside this bar: `bathrooms` (UnitSearchView has no control of
 * its own for it yet, see that file's doc comment) and `minArea`/`maxArea`
 * (always real stored m², converted to the visitor's display AreaUnit only
 * for the on-screen label — see unitDisplay.ts).
 *
 * Surface's dual-thumb slider bounds are the real min/max `unit.area`
 * across this project's actual inventory (not the reference render's
 * literal "50–120", which was just that mockup's own placeholder data) —
 * degenerates to a plain static readout when there are fewer than two
 * distinct areas to make a real range from (0 or 1 units, or every unit
 * sharing one identical area), an honest empty/degenerate state rather
 * than a fake interactive slider with nothing to actually narrow.
 *
 * Mobile bottom sheet (direct design reference, 2026-08-17) — Units is no
 * longer desktop-only at the "here are the filters" level: below `isDesktop`
 * this now renders a real bottom sheet (drag-handle affordance, full-width
 * header/count/subtitle/close, stacked Surface/Bedrooms/Bathrooms/
 * Availability) sharing the exact same `filters`/`units` state and
 * computed values as the desktop bar above — same reasoning ViewsWorkspace/
 * SunTimeWorkspace already apply per-field: one real state, two layouts.
 * What's still genuinely desktop-only is the real *list* (`listOpen` /
 * "List Units" / the 380px `UnitsWorkspace` side panel it opens) — Units
 * Search Mode PRD §32's own mobile bottom-sheet browsing pattern isn't
 * built, so the mobile sheet is filters-only, matching the reference
 * render (which has no "List Units" affordance of its own either).
 */
export function UnitsBar({
  activeModule,
  isDesktop,
  units,
  filters,
  onFiltersChange,
  listOpen,
  onToggleList,
  onClose,
}: {
  activeModule: ActiveModule;
  isDesktop: boolean;
  units: Unit[];
  filters: UnitFilterState;
  onFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
  /** Desktop only — see this component's own doc comment. */
  listOpen: boolean;
  onToggleList: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const { areaUnit } = useViewerPreferences();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activeModule === "units";

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      y: open ? 0 : 12,
      duration: reducedMotion ? 0 : 0.3,
      ease: "power2.out",
    });
    // `isDesktop` is a real dependency, not just `open`/`reducedMotion` —
    // this component now renders two structurally different DOM nodes
    // (desktop bar vs. mobile sheet) off the same `panelRef`, so resizing
    // across the breakpoint while Units is open swaps which node the ref
    // points at. Without re-running this effect on that swap, the newly-
    // mounted node would keep its static opacity-0 Tailwind class forever
    // (GSAP only wrote inline styles onto the *previous* node), i.e. Units
    // would silently stay invisible after a resize.
  }, [open, reducedMotion, isDesktop]);

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

  const bathroomOptions = useMemo(
    () => Array.from(new Set(units.map((u) => u.bathrooms))).sort((a, b) => a - b),
    [units]
  );

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

  // Real dual-thumb Surface slider — identical bounds/fill/handlers as the
  // desktop branch below, just reused inline here since the mobile sheet's
  // own track needs the exact same JSX at a different (full-width) size.
  const surfaceSlider = areaBounds ? (
    <div className="relative flex h-6 items-center">
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
    <div className="flex h-6 items-center" aria-hidden="true">
      <div className="h-1.5 w-full rounded-full bg-white/10" />
    </div>
  );

  const availabilityPills = (extraClassName: string) => (
    <div className={extraClassName}>
      {AVAILABILITY_PILLS.map((id) => {
        const isActive = filters.status === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onFiltersChange((prev) => ({ ...prev, status: id }))}
            aria-pressed={isActive}
            className={cn(
              "whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors",
              isActive ? "bg-brand-500 text-white" : "border border-white/15 text-white/75 hover:border-white/25 hover:text-white"
            )}
          >
            {t(`units.status.${id}`)}
          </button>
        );
      })}
    </div>
  );

  if (!isDesktop) {
    return (
      <div
        ref={panelRef}
        role="group"
        aria-label={t("units.title")}
        aria-hidden={!open}
        className={cn(
          // Same `w-[calc(100vw-1.5rem)]` full-width-minus-inset formula
          // SunTimeWorkspace/ViewsWorkspace's own mobile branches already
          // use — real content this time (not a placeholder), but the
          // exact same positioning technique. No `overflow-hidden` (see
          // the desktop branch's own doc comment for the real dropdown-
          // clipping bug that taught this) and no accent ring, matching
          // the reference render (a plain dark sheet) and SunTimeWorkspace's
          // own un-ringed mobile branch.
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel px-4 pb-4 pt-2.5 opacity-0",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {/* Drag-handle affordance — decorative only, no real swipe-to-
            dismiss gesture wired (close is tap-outside / re-tapping Units,
            same as every other module panel). Header row (icon/title/
            count/subtitle) and the × close button were both removed
            entirely (direct design feedback, 2026-08-17: "Remove top
            header", then a follow-up "Remove X from units" superseding an
            earlier ask to just relocate it) — Surface is the first real
            content now. */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />

        <div>
          <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterSurface")}</span>
          {surfaceSlider}
          <div className="flex items-center justify-between text-sm font-semibold tabular-nums text-white">
            <span>{areaBounds ? formatUnitArea(effMin, areaUnit) : "—"}</span>
            <span>{areaBounds ? formatUnitArea(effMax, areaUnit) : "—"}</span>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-3">
          <MobileFilterSelect
            label={t("units.filterBedrooms")}
            value={filters.bedrooms}
            options={BEDROOM_OPTIONS}
            formatOption={bedroomLabel}
            onChange={(v) => onFiltersChange((prev) => ({ ...prev, bedrooms: v }))}
          />
          <MobileFilterSelect
            label={t("units.filterBathrooms")}
            value={filters.bathrooms}
            options={bathroomOptions}
            formatOption={(v) => String(v)}
            onChange={(v) => onFiltersChange((prev) => ({ ...prev, bathrooms: v }))}
          />
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-white/50">{t("units.filterAvailability")}</span>
          {availabilityPills("flex items-stretch gap-2 [&>button]:flex-1 [&>button]:justify-center")}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("units.title")}
      aria-hidden={!open}
      className={cn(
        // Fixed width (not `w-fit`, unlike every other bar in this file
        // tree) — real bug found live-testing: this bar has more zones
        // than Views/Sun & Time (title, Surface, Bedrooms, Bathrooms,
        // Availability, close), and once a flex row gets this wide/
        // complex, Chromium's `fit-content` intrinsic-width pass
        // measurably undershoots its own children's real needed width
        // (reproduced via getBoundingClientRect + scrollWidth: the
        // container computed ~35px narrower than its content actually
        // needed), clipping the close button under `overflow-hidden` even
        // though every individual child measured at its own correct
        // width. A third instance of the general "w-fit under a busy flex
        // row" class of bug this session already hit twice elsewhere
        // (SunTimeWorkspace's `flex-1` and `flex-wrap` cases) — this time
        // fixed by not asking the browser to compute intrinsic sizing at
        // all. `useIsDesktop`'s own 1024px floor (`calc(100vw-2rem)` =
        // 992px minimum) always has room for it. Re-measured down from
        // 940px→904px (direct design feedback, 2026-08-17: "remove empty
        // space on the right") after the Availability label removal below
        // shrank real content further — checked via the same real-child-
        // rects technique, not guessed: content's own last pixel now
        // sits ~897px from the bar's left edge including the right
        // padding, so 904px leaves a small buffer rather than being
        // measured exactly to the pixel again.
        //
        // No `overflow-hidden` (unlike every sibling bar) — real bug found
        // live-testing: Bedrooms/Bathrooms's own dropdown panels open
        // *upward*, same as SunTimeWorkspace's dateMenuCompact, but this
        // bar's `overflow-hidden` silently clipped them to fully invisible
        // (0 opacity of paint, not layout — `aria-expanded`/the chevron
        // flip both fired correctly, and Playwright's own actionability
        // check reported the panel "visible", but the click still fell
        // through to the 3D canvas underneath, proving nothing was
        // actually painted there). None of this bar's children paint a
        // hover background that reaches its own rounded outer edge (same
        // reasoning ViewerUtilities' own doc comment gives for its
        // identical fix), so corner-clipping was never actually needed
        // here.
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex h-[60px] w-[904px] max-w-[calc(100vw-2rem)] -translate-x-1/2 items-stretch rounded-panel px-3.5 opacity-0 ring-2 ring-brand-400/50 sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Title zone — doubles as the real "List Units" trigger (direct
          instruction: "when clicked LIST UNITS then open the left panel").
          Same nested circle-badge treatment as every other bar's title
          zone, tinted brand-400 while the list is actually open. */}
      <button
        type="button"
        onClick={onToggleList}
        aria-pressed={listOpen}
        aria-label={t("units.listUnits")}
        title={t("units.listUnits")}
        className={cn(
          "flex shrink-0 items-center gap-2.5 rounded-control pr-3.5 transition-colors sm:pr-4",
          listOpen ? "text-brand-400" : "text-white hover:text-brand-300"
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 transition-colors",
            listOpen ? "bg-brand-500/25 ring-brand-400" : "bg-brand-500/15 ring-brand-400/50"
          )}
        >
          <Building2 className="h-4 w-4 text-brand-400" aria-hidden="true" />
        </span>
        <span className="flex flex-col items-start gap-0.5 leading-none">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-sm font-bold text-white">{t("units.title")}</span>
            <span className="text-xs font-normal text-white/50">{t("units.foundCount", { count: filteredCount })}</span>
          </span>
          <span className="whitespace-nowrap text-[11px] font-normal normal-case text-white/50">{t("units.refineSubtitle")}</span>
        </span>
      </button>

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {/* Surface zone — real min/max `unit.area` for this project (see doc
          comment above), not the reference render's own placeholder
          "50–120". */}
      <div className="flex w-52 shrink-0 flex-col justify-center gap-1 px-3.5 sm:px-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="whitespace-nowrap text-[11px] text-white/50">{t("units.filterSurface")}</span>
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-white">
            {areaBounds ? `${formatUnitArea(effMin, areaUnit)} – ${formatUnitArea(effMax, areaUnit)}` : "—"}
          </span>
        </div>
        {areaBounds ? (
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
          // Degenerate range (0 or 1 units, or every unit sharing one
          // identical area) — an inert flat track rather than a fake
          // draggable slider with nothing real to narrow, or a "no
          // results" message that would misdescribe a data-shape problem
          // as a filtering one.
          <div className="flex h-5 items-center" aria-hidden="true">
            <div className="h-1.5 w-full rounded-full bg-white/10" />
          </div>
        )}
      </div>

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      <CompactFilterSelect
        label={t("units.filterBedrooms")}
        value={filters.bedrooms}
        options={BEDROOM_OPTIONS}
        formatOption={bedroomLabel}
        onChange={(v) => onFiltersChange((prev) => ({ ...prev, bedrooms: v }))}
      />

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      <CompactFilterSelect
        label={t("units.filterBathrooms")}
        value={filters.bathrooms}
        options={bathroomOptions}
        formatOption={(v) => String(v)}
        onChange={(v) => onFiltersChange((prev) => ({ ...prev, bathrooms: v }))}
      />

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {/* Availability zone — real `filters.status`, same field
          UnitSearchView's own 4-pill row (incl. "All") already drives; this
          compact version mirrors the reference render's own 3 pills. Shared
          `availabilityPills` helper — same buttons the mobile sheet below
          renders, just a different wrapper className (compact row here vs.
          equal-width `flex-1` there). Label removed (direct design
          feedback, 2026-08-17: "remove the word 'availability'") — the
          3 pills (Available/Reserved/Sold) read clearly on their own. */}
      <div className="flex shrink-0 items-center pl-3.5 sm:pl-4">{availabilityPills("flex items-center gap-1.5")}</div>

      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />

      <button
        type="button"
        onClick={onClose}
        aria-label={t("units.close")}
        title={t("units.close")}
        className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-control text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
