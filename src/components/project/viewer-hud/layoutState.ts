import type { ActiveModule } from "./types";

/**
 * Global per-menu layout state — Views Menu PRD §26 "Global Menu Layout
 * States" / §27 "GSAP Master Transition System, ViewerLayoutController".
 * That PRD's own point is that Units isn't a one-off special case: every
 * bottom-nav item maps to a *complete* Viewer layout (panel, viewport
 * width), and switching menus is one coordinated transition between two
 * such states, not ad-hoc per-module logic.
 *
 * Used to also carry `headerReversed` (Units used to swap the header's
 * identity/compass order while its panel was open) — removed per direct
 * design feedback: that order is now fixed regardless of which module is
 * active, so this state model no longer needs to describe it.
 *
 * Written now (Units Phase 1) rather than later specifically so the
 * Units-only plumbing being built alongside this doesn't have to be
 * reworked once Views' own phase adds a second module that also affects
 * layout — Explore/Views/Sun&Time all resolve to the exact same
 * (closed-panel) state per §26's table, so this function already has the
 * right shape for that, it's just Units that currently ever returns
 * anything else.
 *
 * Units Bar redesign (2026-08-17, direct design reference): selecting
 * Units used to open the real left panel immediately. Now selecting Units
 * opens a floating filter bar (UnitsBar) instead — matching Views/
 * Sun & Time's own bar treatment — and the real 380px panel only opens
 * once the visitor explicitly clicks its "List Units" trigger inside that
 * bar. `unitsListOpen` (owned by ProjectViewerRuntime, toggled by that click)
 * is the new third input this now needs.
 */
export interface ViewerLayoutState {
  /** UnitsWorkspace open/closed — the only thing that currently changes viewport width. */
  leftPanelOpen: boolean;
  /** MobileUnitsSheet open/closed — the same "the visitor asked for the
   * list" intent as `leftPanelOpen`, resolved for the other breakpoint.
   * Deliberately a second field rather than one shared boolean plus an
   * `isDesktop` check at each call site: the two surfaces are structurally
   * different (a flex-sibling column that reflows the viewport vs. an
   * overlay above the dock), so every consumer needs to know which one it
   * is getting, not merely that "the list is open". */
  unitsSheetOpen: boolean;
}

/**
 * `isDesktop` no longer decides *whether* the visitor gets a unit list —
 * only *which shape* of one. Units Search Mode PRD §4's 360-420px left
 * panel is still a desktop layout by design (a real bug found live-testing
 * on a 390px viewport: without a gate, the fixed-width panel opened anyway
 * and ate almost the entire screen), but §32's own mobile bottom-sheet
 * pattern is now built (`MobileUnitsSheet.tsx`), so below `lg` the same
 * "Filter List" click resolves to that instead of to nothing.
 *
 * That "instead of to nothing" was the real defect this closes: the dock's
 * mobile Units row has shipped a fully-styled "Filter List" trigger with a
 * live result count for months, and tapping it flipped a boolean no mobile
 * surface read.
 *
 * `unitsListOpen` gates it a second time on top of that (see the module
 * doc comment above) — the real panel now only opens once both "Units is
 * the active module on desktop" AND "the visitor asked for the list"
 * are true.
 */
export function getViewerLayoutState(activeModule: ActiveModule, isDesktop: boolean, unitsListOpen: boolean): ViewerLayoutState {
  const listRequested = activeModule === "units" && unitsListOpen;
  return {
    leftPanelOpen: listRequested && isDesktop,
    unitsSheetOpen: listRequested && !isDesktop,
  };
}

/**
 * Morphing Bottom Dock PRD (2026-08-18), §21 "Dock Dimensions" / §6 "Dock
 * Container Morph" — desktop target width per dock mode, added here per
 * this file's own doc comment above ("meant to grow more fields as more
 * modules gain layout effects") rather than a parallel constants file.
 *
 * Only `sunTime` has a stored width, and it is deliberately *not* a
 * content measurement: Time's row is one flexible timeline track between
 * two fixed sunrise/sunset readouts, so its own natural width is far
 * narrower than it should render at (measured 336.9px in English /
 * 366.9px in Albanian at 1440×900) — 660 is the room the track is *given*,
 * which the track then fills. Nothing overflows and nothing is left blank
 * either way, so language can't break it; the 30px the two locales differ
 * by is simply absorbed by the track.
 *
 * Every other mode — `nav`, `views`, and (2026-08-24) `units` — has no
 * entry at all and tweens to its own real measured width instead (see
 * `ProjectViewerDock.tsx`'s `targetWidth === "auto"` branch, which
 * measures the incoming content *after* it has actually mounted, then
 * hands sizing back to CSS `width: auto` once the tween lands).
 *
 * `units` used to carry a hardcoded `widthDesktop` here, re-measured by
 * hand every time its content changed (1125 → 869 → 872 → 863). That was
 * a real bug generator, and the direct instruction that retired it
 * (2026-08-24: "there is empty space after X (close button) when 'units'
 * is clicked" / "In english and in Albanian there are 2 different width
 * for the Menu") named both halves of it at once: every one of those
 * numbers was measured in **English**, and Units' row is the one dock
 * mode whose children are all `shrink-0` text, so its real width is
 * language-dependent. Measured at 1440×900 on `tower-vlora`:
 *
 *   Units row natural width   EN 829.6px   SQ 981.7px   (Δ +152.1px)
 *     ├ "Filter List"/"Lista e Filtrave" trigger   117.6 → 150.7  (+33.1)
 *     ├ "Surface"/"Sipërfaqja" trigger             188.4 → 204.8  (+16.4)
 *     ├ "Rooms Any"/"Dhoma Të gjitha" trigger      111.2 → 141.8  (+30.6)
 *     └ Availability pills (4)                     282.5 → 354.4  (+71.9)
 *
 * So the one 863px constant was 33.4px too *wide* in English (the blank
 * strip after the × the instruction flagged) and 118.7px too *narrow* in
 * Albanian (the × and half the "Sold" pill rendered outside the shell's
 * own rounded edge entirely). No single number can be right for both;
 * measuring is the only fix, which is why there is no constant any more.
 * `nav` (430px) and `views` (547px) happen to measure identically in both
 * locales — Navigation's items are fixed `lg:w-24` and Views' are fixed-
 * width shot cards — but they already measure rather than assume, so they
 * were never at risk to begin with.
 *
 * One shared `height` for every mode, not a per-mode height — PRD §6 is
 * explicit ("Avoid dramatically changing height... a horizontal morph
 * feels significantly cleaner than opening another tall panel") and its
 * own worked example keeps height identical across states (`430×62 →
 * 630×62`). This deliberately *supersedes* this session's earlier
 * "match Sun & Time's own ~104px content height" instruction for the
 * pre-dock `SunTimeWorkspace`/`UnitsBar`/`ViewsWorkspace` bars — those
 * panels showed their secondary controls inline (a 2×2 preset grid, or a
 * two-line "label above value" zone), which is what pushed their content
 * past 62px in the first place; the dock moves all of that into popovers
 * (PRD §8/§31) specifically so every mode's content fits one row, matching
 * Navigation's own height exactly and letting the morph animate width (or,
 * on mobile, height — see `DOCK_MORPH_SHADOW`'s own doc comment) alone.
 */
export const DOCK_DIMENSIONS = {
  sunTime: { widthDesktop: 660 },
} as const;

export const DOCK_HEIGHT_DESKTOP = 62;

/**
 * Direct instruction (2026-08-18, "Mobile View"): Nav's and Views' own
 * mobile heights should match Time's — Units is the deliberate exception,
 * explicitly allowed to grow taller "to fit all the filtering system
 * properly". Unlike `DOCK_HEIGHT_DESKTOP` (one shared height enforced by a
 * single fixed `lg:h-[62px]` on `DockShell` itself, so every mode is
 * physically incapable of disagreeing), mobile heights are still content-
 * driven (`DockShell`'s own `h-auto` below `lg`, see that component's doc
 * comment) — Nav/Time/Views/Units each still measure and animate to their
 * own real natural height (`ProjectViewerDock.tsx`'s own mobile
 * height-morph). This constant doesn't change that mechanism; it's a
 * `min-height` floor applied only to Nav's and Views' own mobile content
 * (`NavigationContent.tsx`/`ViewsContent.tsx`), so their *real* still-
 * differently-shaped content (a single icon+label row vs. two stacked
 * rows) ends up occupying the same footprint instead of looking like two
 * different dock sizes depending which of the three you're on.
 *
 * `70`, not the real *shell* height a ruler on the actual dock would read
 * (`72`, per a later follow-up instruction: "Nav, Views, and Time now
 * share exactly 72px", down from an initial `82` pass) — real bug found
 * live-testing on the first pass: this value is applied as `min-height` on
 * the *content* div each mode renders inside `DockShell`, and `DockShell`
 * itself (`.viewer-glass`) carries a real 1px border top and bottom,
 * adding 2px on top of whatever height its one child computes to. Using
 * the shell target directly here landed Nav/Views 2px *taller* than
 * intended (content + border, double-counting). `70` (content) +
 * `DockShell`'s own 2px border lands the shell at the real target, `72` —
 * confirmed via `getBoundingClientRect()` on the shell, not just visually.
 * `TimeContent.tsx`'s own mobile branch was trimmed by 10px (padding/gap/
 * one button's height) to actually land its own real natural height here
 * too, matching this constant rather than the other way around. Re-
 * measure and update both numbers together if Time's own mobile content
 * ever changes shape enough to shift its real height; nothing enforces
 * the two staying in sync automatically the way the desktop constant's
 * shared `DockShell` height does.
 */
export const DOCK_HEIGHT_MOBILE_STANDARD = 70;

/**
 * §5-7 "Premium Morph Animation" / §28 "Do Not Animate Everything Equally"
 * — every phase's timing, centralized so `ProjectViewerDock.tsx` reads one
 * source of truth instead of scattering magic numbers through a
 * `gsap.timeline()` call. All values in seconds (GSAP's own unit), even
 * though the PRD itself writes milliseconds — converted once, here, so
 * nothing downstream needs a `/1000`.
 */
export const DOCK_MORPH_TIMING = {
  /** §5 Phase 1 — clicked icon's own scale-feedback (1 → 0.96 → 1). */
  selectionFeedback: 0.06,
  /** §5 Phase 2 — outgoing content fade/lift, starts partway into phase 1. */
  navCollapse: 0.16,
  /** §6 — the shell's own width/height/radius/padding tween. */
  containerMorph: 0.3,
  /** §7 Phase 4 — incoming content's own per-item reveal duration. */
  contentRevealItem: 0.19,
  /** §7 — gap between each staggered content item's own start time. */
  contentRevealStagger: 0.04,
  /** §9 — a selected preset's time value (and downstream sun/lighting)
   * interpolates rather than jumps; mid-range of the PRD's 600-900ms. */
  presetTween: 0.75,
  /** §30 — how long rapid repeat clicks are ignored once a morph starts;
   * mid-range of the PRD's 300-400ms, independent of the morph's own
   * (shorter) visual duration so a slow device's real paint time can't
   * outrun the lock. */
  transitionLock: 0.35,
  /** §31 — popover open/close. */
  popover: 0.16,
} as const;

/** §6 — "cubic-bezier(0.16, 1, 0.3, 1)", the one recommended ease for the
 * shell's own width/radius/padding morph (GSAP accepts a bare
 * `cubic-bezier(...)` string directly as an ease). */
export const DOCK_MORPH_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * Direct instruction (2026-08-18): "Add a premium animation if the dock
 * gets bigger or smaller." The width/height tween itself (above) already
 * covers the *size* change; this pair covers the *depth* cue layered on
 * top of it in `ProjectViewerDock.tsx`'s own `morphTo` — the shell's own
 * `boxShadow` (and a paired -3px `y`) deepens right as the resize starts
 * and settles back the instant it's done, reading as the dock physically
 * lifting off the glass while it moves rather than a flat box silently
 * changing size. Deliberately an elevation cue, not a scale/position
 * overshoot — PRD §37 "Motion Character" rules out bounce/overshoot, and
 * this doesn't reintroduce it under a different name.
 *
 * Literal `rgba(...)` strings, not `.viewer-glass`'s own `var(--shadow-1)`
 * — GSAP's `boxShadow` tween works by extracting every number out of both
 * the `from` and `to` strings and interpolating them positionally, which
 * needs two structurally identical literal strings (same token count/
 * order) to line up correctly; a CSS custom property isn't resolvable to
 * numbers at all. `rest` is `--shadow-1`'s own resolved value (`0 2px 8px
 * rgba(17, 17, 24, 0.06)`) with an explicit `0px` spread added so both
 * strings share the same 4-value shadow + 4-channel color shape.
 */
export const DOCK_MORPH_SHADOW = {
  rest: "0px 2px 8px 0px rgba(17, 17, 24, 0.06)",
  lifted: "0px 26px 60px 0px rgba(0, 0, 0, 0.55)",
} as const;
