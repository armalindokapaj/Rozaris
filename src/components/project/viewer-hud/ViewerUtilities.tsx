"use client";

import { Camera, Expand, Minimize } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { MoreMenu, type MoreMenuProjectInfo } from "./MoreMenu";

/**
 * Front Page PRD §4 — top-right utility capsule. Icons only, always: one
 * glass pill containing Screenshot / Fullscreen / More (each individually
 * hideable via the existing `viewerUI` admin toggles, same as the old
 * header). 40–44px tall per the PRD's target.
 *
 * The `•••` menu is now real (MoreMenu.tsx, More / Settings Menu PRD,
 * 2026-08-16) — see that component's own doc comment for what's real vs.
 * flagged. Previously a hand-rolled dropdown of disabled preview items;
 * that whole open/close/Escape/click-outside triple now lives inside
 * MoreMenu itself (same "hand-roll instead of the shared useDropdown
 * hook" reasoning still applies there, see its own doc comment).
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

  return (
    <div className="viewer-glass relative flex h-11 shrink-0 items-stretch rounded-panel text-white">
      {screenshotEnabled && (
        <button
          type="button"
          onClick={onScreenshot}
          aria-label={t("project.screenshot")}
          title={t("project.screenshot")}
          className="flex w-11 items-center justify-center transition-colors hover:text-white/70"
        >
          <Camera className="h-4 w-4" />
        </button>
      )}
      {fullscreenEnabled && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={t("unit.viewerFullscreen")}
          title={t("unit.viewerFullscreen")}
          className="flex w-11 items-center justify-center transition-colors hover:text-white/70"
        >
          {fullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      )}
      <MoreMenu project={project} />
    </div>
  );
}
