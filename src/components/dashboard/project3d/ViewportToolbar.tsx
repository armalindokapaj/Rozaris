"use client";

import { Layers, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIEW_PRESETS, type ViewPreset } from "@/lib/viewerPresets";
import type { Translate } from "./editorTypes";

/**
 * Floating toolbar over the 3D viewport (dark-theme configurator restyle,
 * matching the reference mockup's viewport toolbar). Only reproduces
 * controls with a real, already-working backing feature — the View Preset
 * switcher (realistic/conceptual/sketch) and X-Ray, both of which
 * previously lived only inside ProceduralProjectViewer.tsx's own bottom
 * chrome menu (hidden in the admin editor via `showChrome={false}`), now
 * exposed here via that component's new controlled-mode props (see
 * viewerTypes.ts). Deliberately does NOT reproduce the mockup's wireframe/
 * Lit toggle, environment-visibility globe icon, or select/move/scale/
 * annotate tool icons — none of those have a real backing feature and
 * were explicitly declined when scoping this redesign.
 */
export function ViewportToolbar({
  viewPreset,
  onViewPresetChange,
  xrayEnabled,
  onXrayChange,
  xrayAvailable,
  t,
}: {
  viewPreset: ViewPreset;
  onViewPresetChange: (preset: ViewPreset) => void;
  xrayEnabled: boolean;
  onXrayChange: (enabled: boolean) => void;
  /** X-Ray is GLB-only (see ProceduralProjectViewer.tsx) — hidden rather
   * than shown-disabled when no detailed model is loaded yet. */
  xrayAvailable: boolean;
  t: Translate;
}) {
  return (
    <div className="glass-panel-dark absolute left-3 top-3 z-20 flex items-center gap-1 rounded-control p-1">
      <div className="flex items-center gap-0.5 rounded-control bg-white/5 p-0.5">
        {VIEW_PRESETS.map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewPresetChange(id)}
            aria-pressed={viewPreset === id}
            title={t(labelKey)}
            className={cn(
              "flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
              viewPreset === id ? "bg-brand-500 text-white" : "text-white/70 hover:bg-white/10"
            )}
          >
            <Palette className="h-3.5 w-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </div>
      {xrayAvailable && (
        <button
          type="button"
          onClick={() => onXrayChange(!xrayEnabled)}
          aria-pressed={xrayEnabled}
          title={t("project.xray")}
          className={cn(
            "flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
            xrayEnabled ? "bg-brand-500 text-white" : "text-white/70 hover:bg-white/10"
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          {t("project.xray")}
        </button>
      )}
    </div>
  );
}
