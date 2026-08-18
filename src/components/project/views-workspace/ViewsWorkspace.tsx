"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Building2, Camera, LayoutGrid, Plane, Signpost, X } from "lucide-react";
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
 * — this bar was just the preset row by itself for a while, no title
 * badge, no dividers, no jump-to-Sun&Time shortcut. `viewerTimeHours`/
 * `onOpenSunTime` were removed from this component's own props along
 * with that (ViewerHUD's own call site below simply stops passing them —
 * `viewerTimeHours` itself stays real there, still feeding
 * SunTimeWorkspace directly). One divider + a trailing × zone came back
 * (direct instruction 2026-08-18, see the desktop branch's own doc
 * comment) — not a full reversal, "Shots" is still the only *content*
 * zone, × is just an explicit close affordance next to it.
 *
 * Mobile branch (direct instruction, 2026-08-17: "Check all the Radius of
 * the Boxes, check every distance and alignment. Needs to be perfect when
 * going from 1 option to another, seamless") — this component never got
 * one when it was rebuilt into the "bar" style above, unlike its two
 * siblings (UnitsBar/SunTimeWorkspace both already switch to a full-width
 * `w-[calc(100vw-1.5rem)]` auto-height sheet below `isDesktop`). The
 * result was a real seamlessness bug: switching Units → Views → Time on
 * mobile snapped between a wide auto-height sheet, this bar's narrow
 * fixed-`h-[60px]` `w-fit` box, then back to a wide sheet — both the
 * width AND the anchored top edge (bottom-anchored, so a shorter box sits
 * lower) jumped between tabs. Now `isDesktop` gates the same two shapes
 * every other module panel already uses, sharing the identical mobile
 * shell formula verbatim (`w-[calc(100vw-1.5rem)]` + `rounded-panel
 * p-3.5`) so the transition between tabs is really just a height
 * animation, not a width/position jump too.
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
  isDesktop,
  presets,
  activePresetId,
  onSelectPreset,
  onClose,
}: {
  activeModule: ActiveModule;
  isDesktop: boolean;
  presets: CameraPreset[];
  activePresetId: string | null;
  onSelectPreset: (preset: CameraPreset) => void;
  /** Desktop bar's own × (2026-08-18) — same handler ViewerHUD's click-
   * outside and re-tapping "Views" both already call. */
  onClose: () => void;
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
    // `isDesktop` is a real dependency, same reasoning UnitsBar's own doc
    // comment gives for its identical GSAP effect — this component now
    // renders two structurally different DOM nodes off the same
    // `panelRef`, so resizing across the breakpoint mid-session would
    // otherwise leave the newly-mounted node stuck at its static
    // opacity-0 Tailwind class.
  }, [open, reducedMotion, isDesktop]);

  // Just the Shots/preset row now (direct design feedback, 2026-08-17:
  // "Remove everything except Shots") — title zone and the Sun & Time
  // readout, along with their two dividers, are gone; see the module doc
  // comment above. Shared between both branches below.
  const presetRow =
    presets.length === 0 ? (
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
                // `bg-brand-500/10` + `rounded-t-control` on the active
                // preset (direct instruction 2026-08-18: "Shot 4... Shot 1
                // at views... need to be in purple color overlay") — was
                // text-color + underline only, missing the same purple
                // wash `ViewerNavigation`'s own active nav item gets even
                // though this bar already "shares ViewerNavigation's exact
                // visual language" per its own doc comment above; brought
                // in line with it rather than inventing a new treatment.
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

  if (!isDesktop) {
    return (
      <div
        ref={panelRef}
        role="group"
        aria-label={t("viewer.views")}
        aria-hidden={!open}
        className={cn(
          // Same mobile shell formula as UnitsBar/SunTimeWorkspace's own
          // mobile branches, verbatim — see this component's own doc
          // comment for why (a real "seamless tab-switching" bug, direct
          // design feedback). Auto height (not this bar's own fixed
          // `h-[60px]`) so it follows its one row of content, same as the
          // sibling sheets. `px-4 pb-4 pt-2.5` (not a uniform `p-3.5`) to
          // match the drag-handle's own smaller top gap, same reasoning
          // as the other two sheets.
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel px-4 pb-4 pt-2.5 opacity-0",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {/* Drag-handle affordance — decorative only, identical to the
            other two mobile sheets (see UnitsBar's own doc comment). */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />
        {presetRow}
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("viewer.views")}
      aria-hidden={!open}
      className={cn(
        // `min-h-[104px]` (was `h-[60px]`) — direct instruction 2026-08-18:
        // match Sun & Time's own real rendered height (measured 102px,
        // small buffer), the same shared value UnitsBar's desktop bar now
        // also uses instead of each bar picking its own. `w-fit` still
        // grows to fit `presetRow` + the new divider/× zone below with no
        // fixed-width guesswork needed (unlike UnitsBar, this bar has few
        // enough zones that Chromium's intrinsic-width pass measures it
        // correctly — see UnitsBar's own doc comment for why *that* bar
        // can't rely on the same thing).
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex min-h-[104px] w-fit max-w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 items-stretch overflow-hidden rounded-panel px-3.5 ring-2 ring-brand-400/50 sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {presetRow}
      <span className="my-3 w-px shrink-0 bg-white/10" aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="flex shrink-0 items-center pl-3.5 text-white/50 transition-colors hover:text-white sm:pl-4"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
