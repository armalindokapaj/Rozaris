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
}

/**
 * `isDesktop` gates Units specifically: Units Search Mode PRD §4's
 * 360-420px left panel is a desktop layout by design (the PRD's own §32
 * gives mobile a completely different bottom-sheet pattern, explicitly
 * out of scope for now — "Unit Search PRD is for desktop only"). Real bug
 * found live-testing on a 390px viewport: without this gate, the fixed-
 * width panel opened anyway and ate almost the entire screen. Units
 * degrades to the same placeholder ViewerModuleLayer Views/Sun&Time
 * already use on any device until real mobile support lands, rather than
 * either opening a broken oversized panel or silently doing nothing.
 *
 * `unitsListOpen` gates it a second time on top of that (see the module
 * doc comment above) — the real panel now only opens once both "Units is
 * the active module on desktop" AND "the visitor asked for the list"
 * are true.
 */
export function getViewerLayoutState(activeModule: ActiveModule, isDesktop: boolean, unitsListOpen: boolean): ViewerLayoutState {
  if (activeModule === "units" && isDesktop && unitsListOpen) {
    return { leftPanelOpen: true };
  }
  return { leftPanelOpen: false };
}

/**
 * Morphing Bottom Dock PRD (2026-08-18), §21 "Dock Dimensions" / §6 "Dock
 * Container Morph" — desktop target width per dock mode, added here per
 * this file's own doc comment above ("meant to grow more fields as more
 * modules gain layout effects") rather than a parallel constants file.
 *
 * Phase 2 (2026-08-18) adds `units` — Units' old floating `UnitsBar` moves
 * onto the dock too, redesigned into single-line triggers (Surface and a
 * combined Bedrooms+Bathrooms "Rooms" trigger each become a popover, PRD
 * §31's own predicted reuse of `DockPopover`) specifically so it can fit
 * the shared 62px row instead of the old bar's own `min-h-[104px]`.
 * `views` gets no entry, same
 * reasoning as `nav` below — its content (a horizontal Shots row) is
 * already naturally one line, so it tweens toward `"auto"` too rather than
 * a guessed constant.
 *
 * `units`' own `widthDesktop` is a real measured value, not a guess and
 * not derived from GSAP's `"auto"` the way `nav`/`views` are —
 * `ProjectViewerDock.tsx`'s own `targetWidth === "auto"` fix (see that
 * file's doc comment) only measures reliably for a mode it's actually
 * *entering* live, and Units still has enough zones (back/list/Surface/
 * Rooms/Availability/×) that a naive per-child intrinsic-width sum isn't
 * trustworthy either (the exact same concern `UnitsBar.tsx`'s own doc
 * comment raised for Chromium's `fit-content` pass on a row this size).
 * First draft measured ~1125px (icon+"Filter List"+the full "N units
 * found" sentence, plus separate Bedrooms *and* Bathrooms triggers) —
 * wider than this codebase's own smallest supported desktop viewport
 * (`useIsDesktop`'s 1024px floor, ~992px usable). Condensing the count to
 * a bare numeric badge and merging Bedrooms+Bathrooms into one "Rooms"
 * trigger (`UnitsContent.tsx`'s own doc comment) brought the real measured
 * width down to ~869px — a manual DOM probe (`el.style.width = "auto"`,
 * read `getBoundingClientRect().width`, restore), not a visual guess.
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
 *
 * `nav`/`views` modes deliberately have no stored width here — they tween
 * toward GSAP's own `"auto"` target (a real built-in GSAP feature, not a
 * plugin) rather than a hardcoded pixel guess. Both are a handful of
 * fixed-width buttons in a row (Navigation's 4 items; Views' Shot count
 * varies per project, which a constant couldn't account for at all), so
 * `"auto"` always matches the DOM's own real intrinsic width, the same way
 * these bars sized themselves before the dock existed (`ViewerNavigation
 * .tsx`'s own `lg:w-fit`, `ViewsWorkspace.tsx`'s own desktop `w-fit`).
 */
export const DOCK_DIMENSIONS = {
  sunTime: { widthDesktop: 660 },
  units: { widthDesktop: 872 },
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
