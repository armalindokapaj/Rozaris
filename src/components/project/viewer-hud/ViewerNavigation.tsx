"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { useT } from "@/lib/i18n/useT";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/utils";
import { MODULE_ICONS, NAV_ITEMS, type ActiveModule } from "./types";

gsap.registerPlugin(Flip);

type NavId = Exclude<ActiveModule, "none">;

/**
 * Front Page PRD §5-9 — the primary bottom navigation. Icon-only at rest
 * (§5), expands to icon+label on hover/tap (§6), collapses back after a
 * delay (§7). "Explore" is the default/fallback active module — it's the
 * always-available free-orbit camera mode (§14), not a real overlay, so
 * clicking it while already active is a no-op; clicking a different item
 * switches to it, and clicking that same active item again returns to
 * Explore (verified against the render: the Explore icon carries the
 * purple selected ring in every idle/hover shot, never a fully-unselected
 * bar).
 *
 * Expand/collapse choreography uses GSAP Flip rather than tweening
 * `width` directly: every layout-affecting node (each item, label,
 * separator) carries `data-flip`, stays permanently mounted, and only
 * toggles a per-item class (`is-item-expanded`, applied imperatively to
 * that item's own wrapper — see below) that flips their Tailwind width/
 * opacity utilities. The browser does one native reflow for that class
 * flip; `Flip.from` then plays the *visual* transition purely on
 * `transform`/`opacity` — satisfying PRD §27's "use transform/opacity,
 * avoid expensive layout recalculation during animation" for what would
 * otherwise be a per-frame layout tween. `props: "opacity"` on the Flip
 * state capture is what gives labels/separators their fade — no separate
 * manual tween needed.
 *
 * Desktop hover expands *all four* items (marks every item wrapper); a
 * mobile tap expands *only the tapped item* (marks just that one) — a
 * real bug found live-testing on a narrow viewport: reusing the
 * all-four-at-once desktop behavior for tap made the pill overflow a
 * phone-width screen the moment any label appeared. Both paths go
 * through the same `applyExpanded(ids)` so there's one Flip mechanism,
 * not two.
 *
 * The `is-item-expanded` class is toggled with `classList.toggle` instead
 * of React state so the Flip "before" snapshot is always taken in the
 * same synchronous handler that flips the class — a React state round
 * trip would risk the state update and the DOM mutation landing in
 * different commits, which is exactly the race Flip's before/after
 * capture can't tolerate.
 */
export function ViewerNavigation({
  activeModule,
  onSelect,
  sunTimeLabel,
  className,
}: {
  activeModule: ActiveModule;
  onSelect: (id: NavId) => void;
  /** Formatted "09:15 · 21 June" — shown only while Sun & Time is active (PRD §9). */
  sunTimeLabel: string | null;
  className?: string;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const hasHover = useMediaQuery("(hover: hover)");
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Partial<Record<NavId, HTMLDivElement | null>>>({});
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const expandedIdsRef = useRef<Set<NavId>>(new Set());

  function applyExpanded(nextIds: Set<NavId>) {
    const current = expandedIdsRef.current;
    const unchanged = current.size === nextIds.size && [...current].every((id) => nextIds.has(id));
    if (unchanged || !containerRef.current) return;

    const state = Flip.getState(containerRef.current.querySelectorAll("[data-flip]"), {
      props: "opacity",
    });
    const growing = nextIds.size > current.size;
    expandedIdsRef.current = nextIds;
    for (const [id, el] of Object.entries(itemRefs.current) as [NavId, HTMLDivElement | null][]) {
      el?.classList.toggle("is-item-expanded", nextIds.has(id));
    }
    Flip.from(state, {
      duration: reducedMotion ? 0 : growing ? 0.35 : 0.3,
      ease: "power2.out",
      nested: true,
      absolute: false,
    });
  }

  function openExpandedAll() {
    clearTimeout(collapseTimer.current);
    applyExpanded(new Set(NAV_ITEMS));
  }

  function openExpandedOnly(id: NavId) {
    clearTimeout(collapseTimer.current);
    applyExpanded(new Set([id]));
  }

  function scheduleCollapse(delayMs: number) {
    clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => applyExpanded(new Set()), delayMs);
  }

  useEffect(() => () => clearTimeout(collapseTimer.current), []);

  // Units Search Mode PRD §2 step 6 — "Bottom navigation returns to Stage
  // 1 Idle" as part of the Units-open sequence. Scoped to hover-capable
  // devices only: on desktop, clicking Units necessarily happens while
  // still hovering the pill (the cursor is right there), so without this
  // it'd stay visually hover-expanded through the panel-open transition.
  // Mobile's own brief tap-preview (`handleClick`'s `openExpandedOnly` +
  // its 900ms timer) is a deliberate, different moment and must be left
  // alone — this effect no-ops there.
  useEffect(() => {
    if (activeModule === "units" && hasHover) applyExpanded(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule, hasHover]);

  // Front Page PRD §16 "Tap Outside" — touch devices only; on desktop the
  // pill already collapses on mouseleave and an outside click shouldn't
  // fight that.
  useClickOutside(containerRef, () => scheduleCollapse(0), !hasHover);

  function handleClick(id: NavId) {
    if (id === "explore") {
      if (activeModule !== "explore") onSelect("explore");
    } else if (activeModule === id) {
      onSelect("explore");
    } else {
      onSelect(id);
    }
    // Touch devices have no hover state to drive the expand/collapse
    // lifecycle, so a tap stands in for it directly — but only for the
    // tapped item's own label (PRD §16: "reveals its label", singular),
    // not the whole bar.
    if (!hasHover) {
      openExpandedOnly(id);
      scheduleCollapse(900);
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={openExpandedAll}
      onMouseLeave={() => scheduleCollapse(700)}
      className={cn("viewer-glass flex h-[50px] items-center gap-0.5 rounded-pill px-1.5", className)}
    >
      {NAV_ITEMS.map((id, index) => {
        const Icon = MODULE_ICONS[id];
        const isActive = activeModule === id;
        const showTimeLabel = id === "sunTime" && isActive && sunTimeLabel;
        return (
          <div key={id} ref={(el) => { itemRefs.current[id] = el; }} className="flex items-center">
            {index > 0 && (
              <span
                data-flip
                aria-hidden="true"
                className="mx-0.5 h-5 w-0 shrink-0 bg-white/15 opacity-0 [.is-item-expanded_&]:w-px [.is-item-expanded_&]:opacity-100"
              />
            )}
            <button
              type="button"
              data-flip
              onClick={() => handleClick(id)}
              aria-label={t(`viewer.${id}`)}
              aria-pressed={isActive}
              title={t(`viewer.${id}`)}
              className={cn(
                "flex h-11 min-w-11 items-center gap-2 rounded-pill px-2.5 text-sm font-medium transition-colors",
                isActive ? "text-brand-400" : "text-white hover:text-white/80"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span
                data-flip
                className="w-0 shrink-0 overflow-hidden whitespace-nowrap opacity-0 [.is-item-expanded_&]:w-auto [.is-item-expanded_&]:opacity-100"
              >
                {t(`viewer.${id}`)}
              </span>
              {id === "sunTime" && (
                <span
                  className={cn(
                    "shrink-0 overflow-hidden whitespace-nowrap text-xs text-brand-400/80 transition-all duration-300",
                    // Forced hidden while the label itself is showing (hover
                    // or the mobile tap-preview window) — a real bug found
                    // live-testing on a 390px phone: "Sun & Time" *and* a
                    // "01:15 · 16 August" readout together ran the pill past
                    // the screen edge and clipped the date. They settle into
                    // one compact readout instead, same spirit as the PRD's
                    // own "09:15  21 June" example, which never shows the
                    // word label alongside the time either.
                    "[.is-item-expanded_&]:!w-0 [.is-item-expanded_&]:!opacity-0",
                    showTimeLabel ? "ml-0.5 w-auto opacity-100" : "w-0 opacity-0"
                  )}
                >
                  {sunTimeLabel}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
