"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Camera } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { cn } from "@/lib/utils";
import type { CameraPreset } from "@/lib/types";
import type { ActiveModule } from "../viewer-hud/types";

/**
 * Views Menu PRD (2026-08-16) — the real camera-preset tray. §26's own
 * "Global Menu Layout States" table puts Views in the exact same
 * (closed-panel, standard-header, full-width viewport) state as Explore/
 * Sun & Time, which is why layoutState.ts's `getViewerLayoutState` already
 * returned that shape for every module except desktop Units before this
 * component existed — no layout-state changes were needed to build this.
 *
 * `flyToPreset`/`CameraPreset` are real, pre-existing RenderEngine API
 * (Experience Editor v2's own Shots tab, PRD §38) — this is the first
 * *public* consumer of it. Deliberate scope trim: PRD's own render shows
 * a photographic thumbnail per card; `CameraPreset` has no thumbnail
 * field (just id/label/position/target/fov/durationMs) and adding one
 * means an admin capture/upload flow, which is Configurator scope — out
 * of bounds for this Project-Viewer-only session. Cards render a plain
 * icon + label instead of a fabricated photo. The PRD's own "Master GSAP
 * Transition System / ViewerLayoutController" (§27) — one centralized
 * timeline orchestrator replacing every component's own independent
 * open/close tween — is also not built: every panel in this file tree
 * (this one, SunTimeWorkspace, ViewerModuleLayer) already animates
 * correctly off `activeModule` independently, and a real rewrite into one
 * shared orchestrator risks regressing the already-verified black-flash/
 * mobile-gating fixes for a purely internal refactor with no visible
 * behavior change. Flagged, not silently dropped.
 */
export function ViewsWorkspace({
  activeModule,
  presets,
  activePresetId,
  onSelectPreset,
}: {
  activeModule: ActiveModule;
  presets: CameraPreset[];
  activePresetId: string | null;
  onSelectPreset: (preset: CameraPreset) => void;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activeModule === "views";

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    gsap.to(el, {
      autoAlpha: open ? 1 : 0,
      y: open ? 0 : 12,
      duration: reducedMotion ? 0 : 0.3,
      ease: "power2.out",
    });
  }, [open, reducedMotion]);

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("viewer.views")}
      aria-hidden={!open}
      className={cn(
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 rounded-panel p-3",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{t("viewer.views")}</p>
      {presets.length === 0 ? (
        <p className="px-1 py-4 text-center text-sm text-white/40">{t("views.empty")}</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-control p-2 transition-colors",
                  isActive ? "bg-brand-500/20 ring-1 ring-brand-400" : "hover:bg-white/5"
                )}
              >
                <span
                  className={cn(
                    "flex h-14 w-full items-center justify-center rounded-control bg-gradient-to-br",
                    isActive ? "from-brand-500/40 to-brand-900/40" : "from-white/10 to-white/[0.03]"
                  )}
                >
                  <Camera className={cn("h-5 w-5", isActive ? "text-brand-300" : "text-white/40")} aria-hidden="true" />
                </span>
                <span className={cn("w-full truncate text-center text-[11px] font-medium", isActive ? "text-white" : "text-white/70")}>
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
