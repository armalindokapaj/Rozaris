"use client";

import { Camera, Expand, Minimize } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { MoreMenu, type MoreMenuProjectInfo } from "./MoreMenu";

/**
 * Front Page PRD §4 — top-right utility capsule. Icons only, always: one
 * glass pill containing Screenshot / Fullscreen / More (each individually
 * hideable via the existing `viewerUI` admin toggles, same as the old
 * header). `h-12` (direct design feedback, 2026-08-17) — matches
 * ProjectIdentity's own height, same reference NorthCompass and
 * ViewerNavigation now share too (see ProjectIdentity's doc comment).
 *
 * The `•••` menu is now real (MoreMenu.tsx, More / Settings Menu PRD,
 * 2026-08-16) — see that component's own doc comment for what's real vs.
 * flagged. Previously a hand-rolled dropdown of disabled preview items;
 * that whole open/close/Escape/click-outside triple now lives inside
 * MoreMenu itself (same "hand-roll instead of the shared useDropdown
 * hook" reasoning still applies there, see its own doc comment).
 *
 * Mobile (2026-08-18, direct instruction: "Screenshot button is removed
 * on Mobile" / "Full screen is removed on mobile") — both drop out below
 * `isDesktop`'s own 1024px floor, same as every other mobile/desktop split
 * this session's dock work already uses. Neither was ever mobile's
 * strongest affordance anyway (iOS Safari in particular has no usable
 * Fullscreen API), so this isn't just a layout trim. The divider ahead of
 * More/Settings is gated on the *same* condition that decides whether
 * either button rendered — without that it would show as an orphaned line
 * with nothing to its own left once both drop out on mobile.
 */
export function ViewerUtilities({
  screenshotEnabled,
  fullscreenEnabled,
  fullscreen,
  onToggleFullscreen,
  onScreenshot,
  project,
}: {
  screenshotEnabled: boolean;
  fullscreenEnabled: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onScreenshot: () => void;
  project: MoreMenuProjectInfo;
}) {
  const { t } = useT();
  const isDesktop = useIsDesktop();
  const showScreenshot = screenshotEnabled && isDesktop;
  const showFullscreen = fullscreenEnabled && isDesktop;

  return (
    // No `overflow-hidden` here (real bug found live-testing: it clipped
    // MoreMenu's own dropdown — which deliberately overflows this pill's
    // 44px height — down to invisible). Each button gets its own
    // `rounded-control` instead, so hover backgrounds still look like
    // soft rounded rects without needing the parent to clip anything.
    <div className="viewer-glass relative flex h-12 shrink-0 items-stretch gap-0.5 rounded-panel p-0.5 text-white">
      {showScreenshot && (
        <button
          type="button"
          onClick={onScreenshot}
          aria-label={t("project.screenshot")}
          title={t("project.screenshot")}
          className="flex w-11 items-center justify-center rounded-control transition-colors hover:bg-white/10 hover:text-white/70"
        >
          <Camera className="h-4 w-4" />
        </button>
      )}
      {showFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={t("unit.viewerFullscreen")}
          title={t("unit.viewerFullscreen")}
          className="flex w-11 items-center justify-center rounded-control transition-colors hover:bg-white/10 hover:text-white/70"
        >
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      )}
      {/* A real divider ahead of More/Settings — distinguishes it as its
          own affordance (opens a menu) rather than a third icon of the
          same kind as Screenshot/Fullscreen (direct design feedback: the
          old plain icon-only button read as not obviously clickable).
          Gated on the same condition as the two buttons above it — on
          mobile, where neither renders, this would otherwise be a
          dangling line with nothing of its own to its left. */}
      {(showScreenshot || showFullscreen) && <span className="my-2 w-px shrink-0 bg-white/10" aria-hidden="true" />}
      <MoreMenu project={project} />
    </div>
  );
}
