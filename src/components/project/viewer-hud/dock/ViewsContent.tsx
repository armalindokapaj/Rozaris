"use client";

import { forwardRef } from "react";
import { Building2, Camera, LayoutGrid, Plane, Signpost, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import type { CameraPreset } from "@/lib/types";

/** Ported verbatim from (soon-unreferenced) `ViewsWorkspace.tsx`'s own
 * heuristic — see that component's doc comment for the full rationale
 * (`CameraPreset` has no icon/thumbnail field, this pattern-matches common
 * real-estate Shot names and falls back to a generic camera glyph). */
function iconForPresetLabel(label: string) {
  const key = label.trim().toLowerCase();
  if (key.includes("exterior")) return Building2;
  if (key.includes("street")) return Signpost;
  if (key.includes("aerial")) return Plane;
  if (key.includes("neighborhood") || key.includes("neighbourhood")) return LayoutGrid;
  return Camera;
}

/**
 * Morphing Bottom Dock Phase 2 (2026-08-18) — Views' content, ported from
 * `ViewsWorkspace.tsx`'s own desktop bar (`ViewsWorkspace.tsx` itself is
 * left in place, unreferenced, same as `ViewerNavigation.tsx`/
 * `SunTimeWorkspace.tsx` were after Phase 1). Structurally the simplest of
 * the three module contents — the preset row was already a single
 * horizontal line of icon+label buttons even in the old floating bar, so
 * it fits the dock's shared 62px row with no popover/redesign needed the
 * way Units required. No back control (2026-08-18 direct instruction:
 * "remove sign back and views text at the left side") — exiting Views is
 * Escape, re-clicking the active "Views" nav item, or this row's own ×.
 *
 * Width isn't fixed in `DOCK_DIMENSIONS` (see that file's own doc
 * comment) — Shot count varies per project (0 to however many an admin
 * has published), so this tweens toward GSAP's `"auto"` target like `nav`
 * does. Desktop's own shot-row scroller carries a precise `max-w-[636px]`
 * cap (2026-08-18 direct instruction: exactly "5 and a half" fixed-width
 * Shots visible before scrolling — see `renderPresetRow`'s own doc comment
 * for the pixel math; this replaced an earlier flat `max-w-[900px]` guess
 * on the whole root) — GSAP's `"auto"` measurement reads this component's
 * own rendered (already CSS-capped) width, not an unconstrained one, so
 * the cap doesn't need to live on `DockShell` itself.
 *
 * `forwardRef` on this component's own root div directly (no wrapper) —
 * same reasoning as every other dock content component: `ProjectViewerDock`
 *'s content-reveal stagger targets `ref.current.children`.
 */
export const ViewsContent = forwardRef<
  HTMLDivElement,
  {
    isDesktop: boolean;
    presets: CameraPreset[];
    activePresetId: string | null;
    onSelectPreset: (preset: CameraPreset) => void;
    /** Received but no longer rendered as an on-canvas button here
     * (2026-08-18 direct instruction: "remove sign back and views text at
     * the left side") — kept in the type for parity with `TimeContent`
     * (see that file's own doc comment on its own `onBack`) and because
     * `DockContent` still passes the same handler through to all three
     * module contents uniformly. */
    onBack: () => void;
    onClose: () => void;
  }
>(function ViewsContent({ isDesktop, presets, activePresetId, onSelectPreset, onClose }, ref) {
  const { t } = useT();

  // Purple × — see `TimeContent.tsx`'s own doc comment on its identical
  // `closeButton` for the direct instruction this matches.
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("common.close")}
      title={t("common.close")}
      className="flex shrink-0 items-center rounded-control px-1.5 text-brand-400 transition-colors hover:text-brand-300"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // Shot buttons — icon-over-label stacked shape, same as
  // `NavigationContent.tsx`'s own 4 nav buttons (`h-5 w-5` icon over a
  // `text-xs` label, `flex-col items-center justify-center gap-1`,
  // `self-stretch`/`items-stretch` so each button fills the dock's shared
  // row height). Originally desktop had its own separate, shorter
  // single-line icon+label chip; a real bug found live-testing (2026-08-18
  // direct instruction: "fix Shots icon and text positioning after
  // clicking Views") was that chip's box was only ~20px tall, so the
  // outer row's `items-center` centered that small box in the middle of
  // the shared 62px bar instead of filling it, and the active indicator's
  // `absolute bottom-0` (relative to the *button's own* box) landed
  // floating mid-bar instead of flush with the dock's true bottom edge —
  // both a real mismatch against Nav's own tabs. One shared renderer now
  // (same "wrapper owns its own className" shape `UnitsContent.tsx`'s own
  // `renderAvailabilityPills` uses) rather than two near-duplicate JSX
  // blocks — desktop and mobile render identically shaped buttons, just at
  // different row/item paddings. Still `shrink-0` + `overflow-x-auto`
  // rather than Nav's own `flex-1` — Nav always has exactly 4 fixed items
  // with no scroll needed, but Shot count is unbounded per project (0 to
  // however many an admin has published), so these can't evenly divide a
  // fixed width the way Nav's 4 always can.
  function renderPresetRow(itemClassName: string, rowClassName?: string) {
    if (presets.length === 0) {
      return <p className="flex flex-1 items-center justify-center px-2 text-sm text-white/40">{t("views.empty")}</p>;
    }
    return (
      <div className={cn("flex flex-1 items-stretch gap-1 self-stretch overflow-x-auto", rowClassName)}>
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const Icon = iconForPresetLabel(preset.label);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset)}
              aria-pressed={isActive}
              className={cn(
                "relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-t-control transition-colors",
                itemClassName,
                isActive ? "bg-brand-500/10 text-brand-400" : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {/* `truncate` (not desktop's old `whitespace-nowrap`) —
                  harmless on mobile's own `shrink-0` auto-width buttons
                  (nothing to truncate against), but desktop's buttons
                  below are now a real fixed width, so a long admin-typed
                  Shot label needs somewhere to go instead of spilling
                  past the button's edges. */}
              <span className="w-full truncate text-center text-xs font-medium leading-none">{preset.label}</span>
              {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );
  }

  if (isDesktop) {
    return (
      <div ref={ref} className="flex h-full w-full items-center gap-3 px-3.5 sm:px-4">
        {/* Fixed `w-28` (112px) buttons, same fixed-width convention
            Nav's own tabs use (`lg:w-24`) — a real per-button size is what
            makes "5 and a half Shots visible" (2026-08-18 direct
            instruction) a precise, computable cap rather than a guess:
            `max-w-[636px]` = 5 full buttons (5×112) + 5 gaps (`gap-1` =
            4px, one between each pair up to and including the half-shown
            6th) + half of a 6th button (56px) = 560+20+56. Living on the
            scroller itself (not a `max-w` on this whole root the way
            desktop used to cap at a flat `900px` guess) means a project
            with 5 or fewer Shots naturally renders at its own real,
            narrower width instead — `max-width` is a ceiling, not a fixed
            size, so nothing needs to detect "fewer than 5.5" separately. */}
        {renderPresetRow("w-28 px-1", "max-w-[636px]")}
        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
        {closeButton}
      </div>
    );
  }

  // `min-h-[70px]` — direct instruction (2026-08-18): "'views' height will
  // be the same as 'time' submenu" (later tightened to "share exactly
  // 72px" — see `DOCK_HEIGHT_MOBILE_STANDARD`'s own doc comment for why
  // this class reads `70`, not the `72` a ruler on the actual dock would
  // read). One `items-stretch` row (not the earlier close-row-above-
  // preset-row stack) — × moved to the end of the same row (2026-08-18:
  // "Put X in the end"), same single-row shape Nav's own dock content
  // uses.
  return (
    <div ref={ref} className="flex w-full min-h-[70px] items-stretch gap-2 px-3.5">
      {renderPresetRow("px-3")}
      <span className="h-6 w-px shrink-0 self-center bg-white/10" aria-hidden="true" />
      {closeButton}
    </div>
  );
});
