"use client";

import { Box, Camera, Cpu, Palette, Sun, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDITOR_MODES, type EditorMode } from "./modes";
import type { Translate } from "./editorTypes";

const TAB_LABEL_KEY: Record<EditorMode, string> = {
  model: "admin.editorTabModel",
  materials: "admin.editorTabMaterials",
  lighting: "admin.editorTabLighting",
  camera: "admin.editorTabCamera",
  // Label-only rename to match the dark-theme mockup's naming — mode id
  // stays "effects" (unchanged content: rendering mode/quality preset/
  // performance toggles).
  effects: "admin.editorTabEffects",
  viewer: "admin.editorTabViewer",
};

const TAB_ICON: Record<EditorMode, typeof Box> = {
  model: Box,
  materials: Palette,
  lighting: Sun,
  camera: Camera,
  effects: Cpu,
  viewer: Eye,
};

/** The 7-mode tab strip. Restyled (dark-theme configurator pass) to an
 * icon-over-label strip with a brand-colored active underline, matching
 * the reference mockup's top nav — same 7 modes/content as before, no
 * panel regrouping, two labels renamed only (see TAB_LABEL_KEY comments).
 * Horizontally scrollable on narrow viewports rather than wrapping, so it
 * stays one row. */
export function ModeTabBar({
  active,
  onChange,
  t,
}: {
  active: EditorMode;
  onChange: (mode: EditorMode) => void;
  t: Translate;
}) {
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 px-3 py-1.5 scroll-thin">
      {EDITOR_MODES.map((mode) => {
        const Icon = TAB_ICON[mode];
        const isActive = active === mode;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            aria-pressed={isActive}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors",
              isActive
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            )}
          >
            <Icon className="h-4 w-4" />
            {t(TAB_LABEL_KEY[mode])}
          </button>
        );
      })}
    </div>
  );
}
