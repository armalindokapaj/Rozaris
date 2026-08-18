"use client";

import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Morphing Bottom Dock PRD §6/§25/§36 — the one permanent physical
 * container. `ProjectViewerDock` owns the forwarded `ref` (so it can
 * GSAP-tween `width` directly on the real element for the container-morph
 * phase) and passes whatever `DockContent` currently renders as
 * `children`; this component itself stays dumb about which module is
 * active, same split `DockContent`'s own doc comment describes.
 *
 * Styling resolves §36 ("near-black ~94-97% opacity... subtle backdrop
 * blur... avoid glassmorphism-heavy styling") against a constraint found
 * this session: `.viewer-glass` (every other HUD panel's shared class) is
 * fully opaque by an earlier direct instruction ("switched to a fully
 * solid, opaque panel... no see-through into the 3D scene behind it").
 * Honors the more recent instruction — a near-opaque literal
 * (`rgba(12,14,18,0.96)`, inline, overriding just `.viewer-glass`'s own
 * `background`) rather than reopening that with real backdrop-blur.
 *
 * No purple ring — PRD §19-20 is explicit that the *shell* itself must
 * stay dark/black always, purple only ever marking specific active
 * controls inside it. This is the same principle this session already
 * relearned once on `ViewerNavigation.tsx` (a whole-pill purple tint was
 * tried and explicitly reverted, "make it black like Rozaris at top left
 * bar") — applying it to one shell instead of one pill, not
 * re-litigating it.
 *
 * Radius is its own `rounded-[16px]` (PRD's 14-18px range) rather than
 * the shared `--radius-panel` token (12px, used app-wide including the
 * light-theme dashboard/marketing side) — scoped to just this component
 * instead of nudging a global token for one dark-chrome use.
 *
 * Height: fixed `h-[62px]` at `lg`+ always (see `DOCK_HEIGHT_DESKTOP` in
 * `layoutState.ts` — Nav and Time share one height by design, only width
 * is a GSAP target). Below `lg`, height is content-driven (`h-auto`) —
 * PRD §23 explicitly wants the dock to grow taller on mobile rather than
 * cram everything into one row.
 *
 * No `overflow-hidden` — real bug found live-testing: `TimeContent`'s own
 * preset `DockPopover` opens *upward* (`absolute bottom-full`, deliberately
 * outside this shell's own box, see that component's doc comment), and
 * `overflow-hidden` here silently clipped it to fully invisible — 0
 * opacity of paint, not layout, so `aria-expanded` still flipped correctly
 * but every click on a popover item fell through to the 3D canvas
 * underneath instead. This is the exact same bug `UnitsBar.tsx`'s own
 * doc comment already documents in detail for its identical upward-
 * opening `CompactFilterSelect` dropdowns — same fix, same reasoning.
 */
export const DockShell = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function DockShell(
  { children, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn("viewer-glass relative flex h-auto items-stretch rounded-[16px] lg:h-[62px]", className)}
      style={{ background: "rgba(12, 14, 18, 0.96)" }}
    >
      {children}
    </div>
  );
});
