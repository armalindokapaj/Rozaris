"use client";

import { Box, Building2, Camera, Cpu, Palette, Scissors, Sun, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDITOR_MODES, type EditorMode } from "./modes";
import type { Translate } from "./editorTypes";

const TAB_LABEL_KEY: Record<EditorMode, string> = {
  model: "admin.editorTabModel",
  materials: "admin.editorTabMaterials",
  lighting: "admin.editorTabLighting",
  camera: "admin.editorTabCamera",
  sections: "admin.editorTabSections",
  inventory: "admin.editorTabInventory",
  effects: "admin.editorTabEffects",
  viewer: "admin.editorTabViewer",
};

const TAB_ICON: Record<EditorMode, typeof Box> = {
  model: Box,
  materials: Palette,
  lighting: Sun,
  camera: Camera,
  sections: Scissors,
  inventory: Building2,
  effects: Cpu,
  viewer: Eye,
};

/** The 7-mode tab strip — full width, directly under the global header
 * (Inventory/Floors mockup pass), all-caps labels matching the reference
 * mockup's MODEL/MATERIALS/... nav. Same modes/content as before, just
 * "Inventory" back as its own tab (see modes.ts) instead of a permanent
 * left panel. Horizontally scrollable on narrow viewports rather than
 * wrapping, so it stays one row. */
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
              "flex shrink-0 flex-col items-center gap-1 border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors",
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
