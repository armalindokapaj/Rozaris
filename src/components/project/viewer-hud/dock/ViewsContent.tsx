"use client";

import { forwardRef } from "react";
import { ArrowLeft, Building2, Camera, LayoutGrid, Plane, Signpost, X } from "lucide-react";
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
 * way Units required; this is close to a straight port plus a back button
 * replacing the old bar's own title-less "just the row" shape.
 *
 * Width isn't fixed in `DOCK_DIMENSIONS` (see that file's own doc
 * comment) — Shot count varies per project (0 to however many an admin
 * has published), so this tweens toward GSAP's `"auto"` target like `nav`
 * does. `max-w-[min(900px,calc(100vw-2rem))]` (same cap the old bar's own
 * desktop branch used) keeps a project with many Shots from stretching the
 * dock edge-to-edge — GSAP's `"auto"` measurement reads this component's
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
    onBack: () => void;
    onClose: () => void;
  }
>(function ViewsContent({ isDesktop, presets, activePresetId, onSelectPreset, onBack, onClose }, ref) {
  const { t } = useT();

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="flex shrink-0 items-center gap-1.5 rounded-control px-1.5 text-sm font-semibold text-white/80 transition-colors hover:text-white"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t("viewer.views")}
    </button>
  );

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("common.close")}
      title={t("common.close")}
      className="flex shrink-0 items-center rounded-control px-1.5 text-white/50 transition-colors hover:text-white"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  const presetRow =
    presets.length === 0 ? (
      <p className="flex flex-1 items-center px-2 text-sm text-white/40">{t("views.empty")}</p>
    ) : (
      <div className="flex flex-1 items-stretch gap-1 overflow-x-auto">
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
                "relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-control px-3 text-sm font-medium transition-colors sm:px-3.5",
                isActive ? "bg-brand-500/10 text-brand-400" : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {preset.label}
              {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );

  if (isDesktop) {
    return (
      <div ref={ref} className="flex h-full w-full max-w-[min(900px,calc(100vw-2rem))] items-center gap-3 px-3.5 sm:px-4">
        {backButton}
        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
        {presetRow}
        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
        {closeButton}
      </div>
    );
  }

  // `min-h-[70px]` — direct instruction (2026-08-18): "'views' height will
  // be the same as 'time' submenu" (later tightened to "share exactly
  // 72px" — see `DOCK_HEIGHT_MOBILE_STANDARD`'s own doc comment for why
  // this class reads `70`, not the `72` a ruler on the actual dock would
  // read). A real measured floor, not a guess; `justify-center` on this
  // column keeps the two rows vertically centered in the extra room
  // rather than pinned to the top with dead space below.
  return (
    <div ref={ref} className="flex w-full min-h-[70px] flex-col justify-center gap-2 px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {backButton}
        {closeButton}
      </div>
      {presetRow}
    </div>
  );
});
