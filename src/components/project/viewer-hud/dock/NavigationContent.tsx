"use client";

import { forwardRef } from "react";
import { gsap } from "gsap";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { cn } from "@/lib/utils";
import { DOCK_MORPH_TIMING } from "../layoutState";
import { MODULE_ICONS, NAV_ITEMS, type ActiveModule } from "../types";

type NavId = Exclude<ActiveModule, "none">;

/**
 * Morphing Bottom Dock PRD §3 "Default Navigation State" — the same
 * Explore/Units/Views/Time item-map `ViewerNavigation.tsx` rendered as its
 * own standalone `viewer-glass rounded-panel h-[60px]` pill, now just this
 * dock mode's *content*: `DockShell` owns the outer chrome once
 * (background/border/radius/height) instead of every mode re-styling its
 * own wrapper. `ViewerNavigation.tsx` itself is left in place, no longer
 * rendered by `ViewerHUD.tsx` as of this rewrite — kept as a reference for
 * a later phase (once Units/Views also move onto this dock), not deleted
 * yet.
 *
 * Selecting Units or Views still calls the exact same `onSelect` →
 * `onActiveModuleChange` ViewerNavigation always called — those two
 * modules' own floating bars (`UnitsBar`/`ViewsWorkspace`) still render as
 * before, as siblings above this dock; only Explore/Time are dock modes
 * this phase (see `ProjectViewerDock.tsx`'s own doc comment). Selecting
 * either of them just leaves this dock showing its own Navigation content,
 * unmorphed, exactly like today.
 *
 * Toggle logic unchanged from `ViewerNavigation.tsx`'s own `handleClick`:
 * Explore is a no-op while already active; any other item switches to it;
 * clicking the currently-active item again returns to Explore.
 *
 * PRD §5 "Phase 1 — Selection Feedback" (the clicked icon's own instant
 * `scale: 1 → 0.96 → 1`) is handled locally here, not by
 * `ProjectViewerDock`'s master timeline — it's scoped entirely to the one
 * button just clicked and has nothing to coordinate with the rest of the
 * morph, so there's no benefit to routing it through the orchestrator.
 * Only fires for entering a module (a real nav tap), not for the
 * back/× exit path — §5's own framing is specifically "tells the user
 * instantly the click registered" for a fresh selection.
 *
 * `forwardRef`, attached directly to this component's own root div (no
 * extra wrapper) — `ProjectViewerDock`'s content-reveal animation targets
 * `ref.current.children` (the 4 nav buttons themselves) directly, so an
 * intermediate wrapper div here would leave only 1 child to "stagger".
 *
 * Mobile height (2026-08-18, direct instruction: "Bottom Dock height will
 * be the same as 'Time' submenu") — `min-h-[DOCK_HEIGHT_MOBILE_STANDARD]`
 * below `lg`, cancelled back to `lg:min-h-0` at desktop (where `DockShell`
 * itself already enforces a real fixed `62px` regardless). This one row's
 * own real content (icon+label buttons) is naturally shorter than Time's
 * two stacked rows, so this is a floor, not a rewrite of the content
 * itself — `items-stretch` (already the row's own cross-axis alignment)
 * is what makes the 4 buttons actually fill the extra height rather than
 * leaving dead space under them.
 */
export const NavigationContent = forwardRef<
  HTMLDivElement,
  { activeModule: ActiveModule; onSelect: (id: NavId) => void }
>(function NavigationContent({ activeModule, onSelect }, ref) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();

  function handleClick(id: NavId, target: HTMLButtonElement) {
    if (!reducedMotion) {
      gsap.timeline().to(target, { scale: 0.96, duration: DOCK_MORPH_TIMING.selectionFeedback, ease: "power1.out" }).to(target, {
        scale: 1,
        duration: DOCK_MORPH_TIMING.selectionFeedback,
        ease: "power1.out",
      });
    }
    if (id === "explore") {
      if (activeModule !== "explore") onSelect("explore");
    } else if (activeModule === id) {
      onSelect("explore");
    } else {
      onSelect(id);
    }
  }

  return (
    <div ref={ref} className="flex h-full min-h-[70px] w-full items-stretch gap-1 px-3.5 sm:px-4 lg:min-h-0">
      {NAV_ITEMS.map((id) => {
        const Icon = MODULE_ICONS[id];
        const isActive = activeModule === id;
        const label = t(`viewer.${id}`);
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => handleClick(id, e.currentTarget)}
            aria-label={label}
            aria-pressed={isActive}
            className={cn(
              // No `h-full` (real bug found live-testing, mobile only,
              // direct instruction: "Dock icons and text are too high
              // placed"): a child's `height: 100%` only resolves against
              // an ancestor whose height came from the `height` property
              // itself — a `min-height`-only ancestor (this row, below
              // `lg`, see its own `min-h-[70px]` class) doesn't count as
              // "specified" for that percentage math, so `h-full` silently
              // computed to nothing and each button fell back to its own
              // ~36px intrinsic content height, stranded at the TOP of the
              // now-taller row instead of filling it — confirmed via
              // `getBoundingClientRect()` on the button, not just a visual
              // guess. Dropping it entirely lets plain flexbox stretch
              // (`items-stretch` on the row, this button's own implicit
              // `align-self: stretch`) size the cross-axis instead, which
              // isn't gated on that same percentage-resolution rule at
              // all — works identically at both breakpoints regardless of
              // whether the row's own real height came from `min-height`
              // (mobile) or `height` (desktop, via `DockShell`'s real
              // fixed `lg:h-[62px]`).
              "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-t-control transition-colors lg:w-24 lg:flex-none",
              isActive ? "bg-brand-500/10 text-brand-400" : "text-white/60 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="whitespace-nowrap text-xs font-medium leading-none">{label}</span>
            {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
});
