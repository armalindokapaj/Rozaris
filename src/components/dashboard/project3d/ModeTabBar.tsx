"use client";

import { cn } from "@/lib/utils";
import { EDITOR_MODES, type EditorMode } from "./modes";
import type { Translate } from "./editorTypes";

const TAB_LABEL_KEY: Record<EditorMode, string> = {
  model: "admin.editorTabModel",
  materials: "admin.editorTabMaterials",
  lighting: "admin.editorTabLighting",
  camera: "admin.editorTabCamera",
  units: "admin.editorTabUnits",
  effects: "admin.editorTabEffects",
  viewer: "admin.editorTabViewer",
};

/** The 7-mode tab strip — new, no prior tab pattern existed in this
 * editor (it was one flat scroll). Horizontally scrollable on narrow
 * viewports rather than wrapping, so it stays one row. */
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
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-100 px-3 py-2 scroll-thin">
      {EDITOR_MODES.map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          aria-pressed={active === mode}
          className={cn(
            "shrink-0 rounded-control px-3 py-1.5 text-xs font-semibold transition-colors",
            active === mode ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
          )}
        >
          {t(TAB_LABEL_KEY[mode])}
        </button>
      ))}
    </div>
  );
}
