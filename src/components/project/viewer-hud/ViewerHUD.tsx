"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { gsap } from "gsap";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/utils";
import { NorthCompass } from "./NorthCompass";
import { ProjectIdentity } from "./ProjectIdentity";
import { ViewerUtilities } from "./ViewerUtilities";
import { ViewerNavigation } from "./ViewerNavigation";
import { ViewerModuleLayer } from "./ViewerModuleLayer";
import { FirstVisitHint } from "./FirstVisitHint";
import { getViewerLayoutState } from "./layoutState";
import type { ActiveModule } from "./types";
import type { ThreeProjectViewerHandle } from "../viewerTypes";
import { SunTimeWorkspace } from "../sun-time/SunTimeWorkspace";
import type { SunTimePreset, SunTimeline } from "@/lib/sunPosition";
import { ViewsWorkspace } from "../views-workspace/ViewsWorkspace";
import { UnitsBar } from "../units-workspace/UnitsBar";
import { DEFAULT_UNIT_FILTERS, type UnitFilterState } from "../units-workspace/unitFilters";
import type { CameraPreset, Unit } from "@/lib/types";
import type { MoreMenuProjectInfo } from "./MoreMenu";

/**
 * Project Viewer — Front Page / Idle Experience (PRD, 2026-08-16).
 * "Project first, UI second": everything here is intentionally minimal
 * chrome around a full-viewport 3D scene, built per the PRD's own
 * component tree (§19) and state model (§20). Explore/Units/Views/
 * Sun & Time get their own dedicated PRDs later — this only owns the
 * shell (compass, identity plate, utility capsule, bottom nav, and the
 * module-layer placeholder each nav item opens).
 *
 * Owns the PRD §12 First Load Sequence (loading overlay → scene →
 * identity → compass/utilities → nav, each a GSAP step). `activeModule`
 * (PRD §20) is now a *controlled* prop rather than local state — the
 * Units Search Mode PRD's own component tree (§36) has `UnitsWorkspace`
 * as a sibling of `ViewerHUD` under `ProjectViewer`, needing the same
 * state, so the parent (ArchVizClient) owns it and both read/drive it.
 * "explore" is the default/fallback (see ViewerNavigation's doc comment).
 * Every module now has a real panel: "units" gets UnitsBar on every device
 * (a desktop bar or a mobile bottom sheet, both real — see that
 * component's own doc comment), plus the real UnitsWorkspace side panel
 * (rendered by the parent, desktop only, and only once its own "List
 * Units" trigger has been clicked — see layoutState.ts's `unitsListOpen`
 * doc comment), "sunTime" gets SunTimeWorkspace, "views" gets
 * ViewsWorkspace. ViewerModuleLayer's "coming soon" placeholder no longer
 * has any real module left to show for — it's dead weight kept mounted
 * only because nothing currently needs it removed. All the real state/
 * data plumbing for Sun & Time, Views, and Units lives in the parent
 * (ArchVizClient), this
 * component just threads it through to the panels below.
 */
export function ViewerHUD({
  viewerRef,
  sceneReady,
  activeModule,
  onActiveModuleChange,
  chromeDimmed,
  project,
  fullscreen,
  onToggleFullscreen,
  onScreenshot,
  screenshotEnabled,
  fullscreenEnabled,
  northOffsetDeg,
  viewerTimeHours,
  sunTimeInteractive,
  sunTimeBounds,
  sunTimeline,
  sunTimePresets,
  activeSunPreset,
  sunTimeCanReset,
  onSunTimeChange,
  onSunPresetSelect,
  onSunTimeReset,
  cameraPresets,
  activeViewPresetId,
  onSelectViewPreset,
  units,
  unitFilters,
  onUnitFiltersChange,
  unitsListOpen,
  onToggleUnitsList,
}: {
  viewerRef: React.RefObject<ThreeProjectViewerHandle | null>;
  sceneReady: boolean;
  activeModule: ActiveModule;
  onActiveModuleChange: (module: ActiveModule) => void;
  /** More / Settings Menu PRD §14 "Interface Auto-Hide" — computed by the
   * parent now (2026-08-17), not here: ArchVizClient also needs it to
   * drive the 3D camera's own idle auto-rotate (see that component's own
   * doc comment), and two independent `useIdleFade` timers in two
   * components would be wasteful and could drift out of sync with each
   * other. This component just applies it visually. */
  chromeDimmed: boolean;
  /** More / Settings Menu PRD — also feeds MoreMenu's Project Information
   * section, hence the richer shape than the old projectName/developerName/
   * city trio it replaces. */
  project: MoreMenuProjectInfo;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onScreenshot: () => void;
  screenshotEnabled: boolean;
  fullscreenEnabled: boolean;
  northOffsetDeg?: number;
  viewerTimeHours?: number;
  /** Sun & Time PRD §9 — whether an admin has actually turned on live
   * time control for this project (solarControllerEnabled &&
   * viewerTimeControlEnabled). Off is the default for every project today
   * (see SunTimeWorkspace's own doc comment); the panel still renders,
   * read-only, rather than hiding entirely. */
  sunTimeInteractive?: boolean;
  sunTimeBounds?: { startHours: number; endHours: number; stepMinutes: number };
  sunTimeline?: SunTimeline;
  sunTimePresets?: SunTimePreset[];
  activeSunPreset?: SunTimePreset["id"] | null;
  /** Whether the visitor has actually scrubbed away from the published
   * default (Reset PRD §32 has nothing to do until they have). */
  sunTimeCanReset?: boolean;
  onSunTimeChange?: (hours: number) => void;
  onSunPresetSelect?: (preset: SunTimePreset) => void;
  onSunTimeReset?: () => void;
  /** Views Menu PRD — real admin-saved camera Shots (Experience Editor v2,
   * Camera tab §38); [] on any project that hasn't published one yet. */
  cameraPresets?: CameraPreset[];
  activeViewPresetId?: string | null;
  onSelectViewPreset?: (preset: CameraPreset) => void;
  /** Units Bar (2026-08-17) — real project inventory (same `units`
   * ArchVizClient already feeds UnitsWorkspace) and the same
   * `UnitFilterState` shared with it, so this bar's Surface/Bedrooms/
   * Bathrooms/Availability controls genuinely narrow the same list. */
  units?: Unit[];
  unitFilters?: UnitFilterState;
  onUnitFiltersChange?: Dispatch<SetStateAction<UnitFilterState>>;
  /** Whether the real UnitsWorkspace side panel is open — owned by
   * ArchVizClient (see layoutState.ts), driven by UnitsBar's own "List
   * Units" trigger below. */
  unitsListOpen?: boolean;
  onToggleUnitsList?: () => void;
}) {
  const reducedMotion = useEffectiveReducedMotion();
  const isDesktop = useIsDesktop();
  const [loadSequenceDone, setLoadSequenceDone] = useState(false);
  const { leftPanelOpen } = getViewerLayoutState(activeModule, isDesktop, !!unitsListOpen);
  // ViewerModuleLayer's "coming soon" placeholder should stay hidden for
  // Units on *any* device now — UnitsBar (rendered below) covers it for
  // real everywhere (mobile bottom sheet + desktop bar, 2026-08-17), not
  // just desktop. Distinct from `leftPanelOpen` on purpose: that only
  // tracks the real 380px side panel, which stays desktop-only and only
  // opens once its own "List Units" trigger is clicked.
  const unitsHandledByUnitsBar = activeModule === "units";

  const overlayRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const utilitiesRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const navGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sceneReady) return;
    const d = (seconds: number) => (reducedMotion ? 0.001 : seconds);
    const tl = gsap.timeline({
      onComplete: () => setLoadSequenceDone(true),
    });
    tl.to(overlayRef.current, { autoAlpha: 0, duration: d(0.5), ease: "power1.out" })
      .fromTo(
        identityRef.current,
        { autoAlpha: 0, y: -6 },
        { autoAlpha: 1, y: 0, duration: d(0.4), ease: "power1.out" }
      )
      .fromTo(
        [compassRef.current, utilitiesRef.current],
        { autoAlpha: 0, y: -6 },
        { autoAlpha: 1, y: 0, duration: d(0.35), ease: "power1.out", stagger: d(0.05) }
      )
      .fromTo(
        navRef.current,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: d(0.4), ease: "power1.out" }
      );
    return () => {
      tl.kill();
    };
  }, [sceneReady, reducedMotion]);

  // Front Page PRD §16 "Tap Outside" — closes an open module and returns
  // the nav to its Explore/default look. Inactive (and therefore free)
  // whenever Explore is already the active module. Units Search Mode PRD
  // §2 gives the real 380px UnitsWorkspace side panel its own explicit
  // close (× / clicking Units again / PRD §31) rather than a stray click
  // anywhere outside the nav — so this only excludes Units while that real
  // panel is actually open (`leftPanelOpen`, desktop-only, see
  // layoutState.ts). UnitsBar itself (both its desktop bar and mobile
  // sheet) is a normal module panel like Views/Sun & Time and should close
  // on outside-tap same as theirs, so it isn't excluded here.
  useClickOutside(navGroupRef, () => onActiveModuleChange("explore"), activeModule !== "explore" && !leftPanelOpen);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        ref={overlayRef}
        className={
          "absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-neutral-900 " +
          (sceneReady ? "pointer-events-none" : "pointer-events-auto")
        }
      >
        <span className="font-serif text-lg tracking-[0.3em] text-white">ROZARIS</span>
        <div className="viewer-loading-bar h-[2px] w-32 rounded-full" />
      </div>

      <header
        className={cn(
          // `items-center` (was `items-start`) — now that ProjectIdentity/
          // NorthCompass/ViewerUtilities all share one fixed `h-12`
          // (direct design feedback, 2026-08-17), this is defensive
          // correctness rather than a visible change today: it keeps them
          // aligned even if a future height ever drifts, instead of
          // silently relying on every child happening to be the same size.
          "absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-opacity duration-700 sm:p-4",
          chromeDimmed && "opacity-40"
        )}
      >
        {/* Always "[ROZARIS|Project] [North]" — identity first, compass
            second, unconditionally. Units Search Mode PRD §8 originally
            swapped this back to "compass first" while that panel was
            open; dropped per direct design feedback (opening Units should
            NOT swap this order) — see layoutState.ts's own doc comment. */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div ref={identityRef} className="pointer-events-auto min-w-0 opacity-0">
            <ProjectIdentity projectName={project.name} developerName={project.developerName} city={project.city} />
          </div>
          <div ref={compassRef} className="pointer-events-auto shrink-0 opacity-0">
            <NorthCompass viewerRef={viewerRef} northOffsetDeg={northOffsetDeg} />
          </div>
        </div>
        <div ref={utilitiesRef} className="pointer-events-auto shrink-0 opacity-0">
          <ViewerUtilities
            screenshotEnabled={screenshotEnabled}
            fullscreenEnabled={fullscreenEnabled}
            fullscreen={fullscreen}
            onToggleFullscreen={onToggleFullscreen}
            onScreenshot={onScreenshot}
            project={project}
          />
        </div>
      </header>

      <FirstVisitHint ready={loadSequenceDone} />

      <div
        ref={navGroupRef}
        className={cn(
          // Bottom inset now matches the header's own top inset exactly
          // (`pt-[max(0.75rem,...)]` mobile, `sm:p-4` desktop above) —
          // was `1.5rem`/`sm:bottom-8`, visibly more offset than the
          // header; direct design feedback wanted the two symmetric.
          //
          // `pl-/pr-[max(0.75rem,env(safe-area-inset-*))]` (mobile only,
          // direct design feedback, 2026-08-17) — the exact same left/
          // right formula the header itself uses. Below `lg` (below
          // `useIsDesktop`'s own 1024px floor, the same split point every
          // other Units-only gate in this file already uses), `navRef`
          // stretches to fill this padded strip edge-to-edge instead of
          // staying a narrow fixed-width pill — real bug found live-
          // testing: ViewerNavigation's 4 fixed-`w-24` desktop items add
          // up to ~424px, wider than many real phone viewports (e.g.
          // 390px), so the "centered" pill was actually overflowing off
          // the left edge, uncentered and partly clipped. `lg:px-0` drops
          // this padding again at desktop, where the existing centered
          // fixed-width pill (unrelated, already-shipped design) is
          // unchanged.
          "pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-center pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-opacity duration-700 sm:bottom-4 lg:px-0",
          chromeDimmed && "opacity-40"
        )}
      >
        <div ref={navRef} className="pointer-events-auto relative w-full opacity-0 lg:w-fit">
          {/* "units" gets UnitsBar (below) on every device now instead of
              this placeholder — see the module doc comment above. */}
          {!unitsHandledByUnitsBar && (
            <ViewerModuleLayer activeModule={activeModule} onClose={() => onActiveModuleChange("explore")} />
          )}
          <UnitsBar
            activeModule={activeModule}
            isDesktop={isDesktop}
            units={units ?? []}
            filters={unitFilters ?? DEFAULT_UNIT_FILTERS}
            onFiltersChange={onUnitFiltersChange ?? (() => {})}
            listOpen={!!unitsListOpen}
            onToggleList={() => onToggleUnitsList?.()}
          />
          {sunTimeBounds && sunTimeline && sunTimePresets && (
            <SunTimeWorkspace
              activeModule={activeModule}
              isDesktop={isDesktop}
              interactive={!!sunTimeInteractive}
              timeHours={viewerTimeHours ?? 12}
              bounds={sunTimeBounds}
              timeline={sunTimeline}
              presets={sunTimePresets}
              activePresetId={activeSunPreset ?? null}
              canReset={!!sunTimeCanReset}
              onTimeChange={(h) => onSunTimeChange?.(h)}
              onPresetSelect={(p) => onSunPresetSelect?.(p)}
              onReset={() => onSunTimeReset?.()}
            />
          )}
          <ViewsWorkspace
            activeModule={activeModule}
            isDesktop={isDesktop}
            presets={cameraPresets ?? []}
            activePresetId={activeViewPresetId ?? null}
            onSelectPreset={(p) => onSelectViewPreset?.(p)}
          />
          <ViewerNavigation activeModule={activeModule} onSelect={onActiveModuleChange} />
        </div>
      </div>
    </div>
  );
}
