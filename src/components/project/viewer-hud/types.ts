import { Building2, Clock, Compass, Image } from "lucide-react";

/**
 * Viewer Front Page / Idle Experience — shared HUD types.
 *
 * Mirrors the state model from the Front Page PRD (§20) literally:
 * `navigationState` and `activeModule` are two separate, independently
 * readable fields (not one derived from the other) even though in
 * practice ViewerHUD computes `navigationState` from a hover flag +
 * `activeModule`. Keeping the same two names/shapes as the PRD makes the
 * code easy to check against it later.
 *
 * Explore/Units/Views/Sun & Time each get their own PRD later — for now
 * `activeModule` only drives which placeholder the ViewerModuleLayer
 * shows, nothing else. "Explore" is the default/fallback module (the
 * always-on free-orbit camera mode), so `activeModule` is never really
 * "none" once the viewer has loaded — see ViewerNavigation's doc comment.
 */
export type NavigationVisualState = "idle" | "hover" | "active";

export type ActiveModule = "none" | "explore" | "units" | "views" | "sunTime";

export const NAV_ITEMS: Exclude<ActiveModule, "none">[] = ["explore", "units", "views", "sunTime"];

/** Shared between ViewerNavigation (bottom pill) and ViewerModuleLayer
 * (the placeholder panel above it) so both agree on one glyph per module.
 * Swapped to match a direct design reference (2026-08-17): compass/
 * buildings/picture-frame/clock, replacing the earlier crosshair/grid/
 * layers/sun set. */
export const MODULE_ICONS: Record<Exclude<ActiveModule, "none">, typeof Compass> = {
  explore: Compass,
  units: Building2,
  views: Image,
  sunTime: Clock,
};
