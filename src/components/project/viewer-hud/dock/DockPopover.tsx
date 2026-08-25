"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/utils";

/**
 * Morphing Bottom Dock PRD §31 "Popovers" — shared primitive for the
 * dock's secondary selections (Time's preset dropdown this phase; a later
 * phase's Units Available▾/Filters and Views' Grid are expected to reuse
 * this same component rather than each hand-rolling their own, unlike
 * `CompactFilterSelect`'s "each call site owns its own ref" precedent in
 * `UnitsBar.tsx` — that assumed one popover per bar; this dock expects
 * several). Deliberately not `src/components/ui/Dropdown.tsx` — that
 * primitive is light-theme only (`rounded-card`/`bg-neutral-0`), has no
 * animation and no Escape handling; every real popover already in this
 * viewer HUD (`MoreMenu.tsx` is the clearest reference) already hand-rolls
 * instead, with its own documented rationale for doing so.
 *
 * Opens *upward* (`bottom-full`) always — the dock sits at the very
 * bottom of the viewport, so a downward popover would run off-screen; the
 * same reasoning `UnitsBar.tsx`'s own `CompactFilterSelect` already
 * documents for its identical upward-opening choice.
 *
 * Animation reuses `.viewer-dropdown-in` (`globals.css`'s `rz-more-menu-in`
 * keyframe — opacity 0→1, `translateY(-6px) scale(0.98)`→none, 0.18s
 * `cubic-bezier(0.16,1,0.3,1)`) rather than a new GSAP tween: it's already
 * exactly PRD §31's 150-180ms range, already has its own
 * `prefers-reduced-motion` → `animation: none` override baked in, and it's
 * the same animation `MoreMenu.tsx`'s own dropdown already uses — one
 * fewer bespoke motion curve for this dock to maintain.
 *
 * Escape is deliberately **not** handled here — `ProjectViewerDock` owns
 * one shared listener implementing the popover→module→nav priority chain
 * (PRD §32); a second independent listener on this component would fire
 * on the same keypress and race it (see `useEscapeKey.ts`'s own doc
 * comment for why that's a real bug, not just redundant).
 *
 * Click-outside is scoped to *this popover's own* `ref` plus its
 * `triggerRef`, not the whole dock — the same `useClickOutside` hook, the
 * same scoping technique `CompactFilterSelect` already proved safe. A
 * dock-*wide* click-outside was tried once this session and broke
 * orbit-drag on the 3D canvas (a drag's own `mousedown` read as
 * "outside"); that risk doesn't apply here since this only listens while
 * its own small popover is open.
 *
 * `triggerRef` is REQUIRED, and is a real bug fix rather than tidiness
 * (direct report, 2026-08-25: "clicking rooms or bathrooms once opens the
 * dropmenu, clicking it again the dropdown menu goes out"). Scoping the
 * outside-check to the panel alone made the trigger itself count as
 * "outside": `useClickOutside` fires on `mousedown`, which closed the
 * popover, and then the trigger's own `onClick` toggled it straight back
 * open — so re-clicking a trigger never dismissed its popover, on any of
 * the four (Surface, Rooms desktop, Rooms mobile, Time presets). Naming
 * the trigger makes `mousedown` on it a no-op and lets the `click`
 * toggle do the closing. Required, not optional, so a new popover cannot
 * quietly reintroduce the same bug — the type checker asks for it.
 */
export function DockPopover({
  open,
  onClose,
  triggerRef,
  anchorClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The button that toggles this popover — see the note above on why
   * omitting it makes the popover impossible to close by re-clicking. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Extra classes for horizontal alignment against the trigger — callers
   * wrap trigger+popover in one `relative` container (see `TimeContent`'s
   * own preset-trigger wrapper) and pass e.g. `"right-0"` / `"left-0"`. */
  anchorClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, open, triggerRef);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "viewer-dropdown-in absolute bottom-full z-10 mb-2 rounded-control border border-white/10 bg-[#101216] p-1.5 shadow-[var(--shadow-2)]",
        anchorClassName
      )}
    >
      {children}
    </div>
  );
}
