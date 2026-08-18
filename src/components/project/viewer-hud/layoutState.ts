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
