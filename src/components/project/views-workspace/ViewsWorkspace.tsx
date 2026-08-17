"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Building2, Camera, LayoutGrid, Plane, Signpost } from "lucide-react";
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
 * Rebuilt (direct design reference, 2026-08-17) from a title+card-grid
 * floating panel into a single horizontal bar sharing ViewerNavigation's
 * exact visual language: same `viewer-glass` + `rounded-panel` + purple
 * ring, same `h-[60px]`, same active-item underline.
 *
 * Trimmed down twice the same day, both direct design feedback: first the
 * title zone's "VIEWS" text and the Sun & Time readout's own text label
 * (icon-only versions of both), then the whole title zone AND the Sun &
 * Time readout were dropped entirely ("Remove everything except Shots")
 * — this bar is now just the preset row by itself, no title badge, no
 * dividers, no jump-to-Sun&Time shortcut. `viewerTimeHours`/
 * `onOpenSunTime` were removed from this component's own props along
 * with that (ViewerHUD's own call site below simply stops passing them —
 * `viewerTimeHours` itself stays real there, still feeding
 * SunTimeWorkspace directly).
 *

 * Per-preset icon is a real, deliberate heuristic — `CameraPreset` has no
 * icon/thumbnail field (see the scope-trim note below), so
 * `iconForPresetLabel` pattern-matches common real-estate preset *names*
 * ("Exterior"/"Street"/"Aerial"/"Neighborhood", matching the reference)
 * and falls back to a generic camera glyph for anything else an admin
 * names a Shot — not every custom label gets a bespoke icon, flagged
 * rather than silently wrong.
 *
 * `flyToPreset`/`CameraPreset` are real, pre-existing RenderEngine API
 * (Experience Editor v2's own Shots tab, PRD §38) — this is the first
 * *public* consumer of it. Deliberate scope trim: PRD's own render shows
 * a photographic thumbnail per card; `CameraPreset` has no thumbnail
 * field (just id/label/position/target/fov/durationMs) and adding one
 * means an admin capture/upload flow, which is Configurator scope — out
 * of bounds for this Project-Viewer-only session. The PRD's own "Master
 * GSAP Transition System / ViewerLayoutController" (§27) — one
 * centralized timeline orchestrator replacing every component's own
 * independent open/close tween — is also not built: every panel in this
 * file tree (this one, SunTimeWorkspace, ViewerModuleLayer) already
 * animates correctly off `activeModule` independently, and a real
 * rewrite into one shared orchestrator risks regressing the already-
 * verified black-flash/mobile-gating fixes for a purely internal
 * refactor with no visible behavior change. Flagged, not silently
 * dropped.
 */
function iconForPresetLabel(label: string) {
  const key = label.trim().toLowerCase();
  if (key.includes("exterior")) return Building2;
  if (key.includes("street")) return Signpost;
  if (key.includes("aerial")) return Plane;
  if (key.includes("neighborhood") || key.includes("neighbourhood")) return LayoutGrid;
  return Camera;
}

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
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex h-[60px] w-fit max-w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 items-stretch overflow-hidden rounded-panel px-3.5 ring-2 ring-brand-400/50 sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Just the Shots/preset row now (direct design feedback, 2026-08-17:
          "Remove everything except Shots") — title zone and the Sun &
          Time readout, along with their two dividers, are gone; see the
          module doc comment above. The bar's own `aria-label` still
          carries "Views" for assistive tech even with no visible title
          left. */}
      {presets.length === 0 ? (
        <p className="flex items-center px-4 text-sm text-white/40">{t("views.empty")}</p>
      ) : (
        <div className="flex items-stretch gap-1 overflow-x-auto px-1">
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
                  "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors sm:px-3.5",
                  isActive ? "text-brand-400" : "text-white/70 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {preset.label}
                {isActive && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-400" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
