import type { ActiveModule } from "./types";

/**
 * Global per-menu layout state — Views Menu PRD §26 "Global Menu Layout
 * States" / §27 "GSAP Master Transition System, ViewerLayoutController".
 * That PRD's own point is that Units isn't a one-off special case: every
 * bottom-nav item maps to a *complete* Viewer layout (panel, viewport
 * width, header order), and switching menus is one coordinated
 * transition between two such states, not ad-hoc per-module logic.
 *
 * Written now (Units Phase 1) rather than later specifically so the
 * Units-only plumbing being built alongside this doesn't have to be
 * reworked once Views' own phase adds a second module that also affects
 * layout — Explore/Views/Sun&Time all resolve to the exact same
 * (closed-panel, standard-header) state per §26's table, so this
 * function already has the right shape for that, it's just Units that
 * currently ever returns anything else.
 */
export interface ViewerLayoutState {
  /** UnitsWorkspace open/closed — the only thing that currently changes viewport width. */
  leftPanelOpen: boolean;
  /** true = "[ROZARIS|Project] [North]" (Units); false = the default "[North] [ROZARIS|Project]". */
  headerReversed: boolean;
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
 */
export function getViewerLayoutState(activeModule: ActiveModule, isDesktop: boolean): ViewerLayoutState {
  if (activeModule === "units" && isDesktop) {
    return { leftPanelOpen: true, headerReversed: true };
  }
  return { leftPanelOpen: false, headerReversed: false };
}
