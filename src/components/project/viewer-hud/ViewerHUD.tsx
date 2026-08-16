"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useT } from "@/lib/i18n/useT";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useIdleFade } from "@/hooks/useIdleFade";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
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
import type { CameraPreset } from "@/lib/types";
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
 * Every module now has a real panel: "units" gets UnitsWorkspace
 * (rendered by the parent, desktop only — see layoutState.ts), "sunTime"
 * gets SunTimeWorkspace, "views" gets ViewsWorkspace. ViewerModuleLayer's
 * "coming soon" placeholder now only ever shows for mobile's own Units
 * fallback. All the real state/data plumbing for Sun & Time and Views
 * lives in the parent (ArchVizClient), this component just threads it
 * through — same pattern viewerTimeHours/simulationDate already used for
 * the nav pill's own compact label below.
 */
export function ViewerHUD({
  viewerRef,
  sceneReady,
  activeModule,
  onActiveModuleChange,
  project,
  fullscreen,
  onToggleFullscreen,
  onScreenshot,
  screenshotEnabled,
  fullscreenEnabled,
  northOffsetDeg,
  viewerTimeHours,
  simulationDate,
  sunTimeInteractive,
  sunTimeBounds,
  sunTimeline,
  sunTimePresets,
  activeSunPreset,
  sunTimeCanReset,
  onSunTimeChange,
  onSunDateChange,
  onSunPresetSelect,
  onSunTimeReset,
  cameraPresets,
  activeViewPresetId,
  onSelectViewPreset,
}: {
  viewerRef: React.RefObject<ThreeProjectViewerHandle | null>;
  sceneReady: boolean;
  activeModule: ActiveModule;
  onActiveModuleChange: (module: ActiveModule) => void;
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
  simulationDate?: string;
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
  onSunDateChange?: (iso: string) => void;
  onSunPresetSelect?: (preset: SunTimePreset) => void;
  onSunTimeReset?: () => void;
  /** Views Menu PRD — real admin-saved camera Shots (Experience Editor v2,
   * Camera tab §38); [] on any project that hasn't published one yet. */
  cameraPresets?: CameraPreset[];
  activeViewPresetId?: string | null;
  onSelectViewPreset?: (preset: CameraPreset) => void;
}) {
  const { locale } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const isDesktop = useIsDesktop();
  const [loadSequenceDone, setLoadSequenceDone] = useState(false);
  const { leftPanelOpen, headerReversed } = getViewerLayoutState(activeModule, isDesktop);

  // More / Settings Menu PRD §14 "Interface Auto-Hide" — only while the
  // visitor is genuinely idle in Explore (default ON, real preference —
  // see useViewerPreferences). Gated off whenever any module panel is
  // open: dimming chrome someone is actively reading (Units/Views/
  // Sun & Time/the More menu itself) would fight the interaction, not
  // support it, which isn't this PRD section's intent.
  const idle = useIdleFade(3500);
  const { interfaceAutoHide } = useViewerPreferences();
  const chromeDimmed = interfaceAutoHide && idle && activeModule === "explore";

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
  // §2 gives Units its own real panel (UnitsWorkspace) with its own
  // explicit close (× / clicking Units again / PRD §31) rather than a
  // stray click anywhere outside the nav — so this only excludes Units
  // when that real panel is actually open (desktop); on narrower
  // viewports Units falls back to the same placeholder views/sunTime use
  // (see layoutState.ts), which should close on outside-tap same as theirs.
  useClickOutside(navGroupRef, () => onActiveModuleChange("explore"), activeModule !== "explore" && !leftPanelOpen);

  // `locale` comes from a persisted (skipHydration) store, so it can read
  // "sq" on the server/first client paint and something else once
  // rehydrated — formatting with it immediately caused a real SSR/client
  // text mismatch (React hydration error) here. This text is invisible
  // until Sun & Time is actually opened (well after mount), so deferring
  // it past hydration via the existing `useHasMounted` costs nothing
  // visible and sidesteps the mismatch cleanly.
  const mounted = useHasMounted();

  const sunTimeLabel = useMemo(() => {
    if (!mounted || viewerTimeHours == null || !simulationDate) return null;
    const hoursNorm = ((viewerTimeHours % 24) + 24) % 24;
    const h = Math.floor(hoursNorm);
    const m = Math.round((hoursNorm - h) * 60);
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const date = new Date(simulationDate);
    if (Number.isNaN(date.getTime())) return time;
    const formattedDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date);
    return `${time} · ${formattedDate}`;
  }, [mounted, viewerTimeHours, simulationDate, locale]);

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
          "absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-opacity duration-700 sm:p-4",
          chromeDimmed && "opacity-40"
        )}
      >
        {/* Units Search Mode PRD §8 — order swaps (identity first, compass
            second) while a real UnitsWorkspace panel sits to the left, so
            identity reads as adjacent to that workspace. Plain `order`
            swap, not yet an animated one — PRD asks for the latter, but
            the panel-open choreography below is Phase 1's real complexity
            budget; flagged as a follow-up polish pass, not a functional gap. */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div ref={compassRef} className={cn("pointer-events-auto shrink-0 opacity-0", headerReversed ? "order-2" : "order-1")}>
            <NorthCompass viewerRef={viewerRef} northOffsetDeg={northOffsetDeg} />
          </div>
          <div ref={identityRef} className={cn("pointer-events-auto min-w-0 opacity-0", headerReversed ? "order-1" : "order-2")}>
            <ProjectIdentity projectName={project.name} developerName={project.developerName} city={project.city} />
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
          "pointer-events-none absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex justify-center transition-opacity duration-700 sm:bottom-8",
          chromeDimmed && "opacity-40"
        )}
      >
        <div ref={navRef} className="pointer-events-auto relative opacity-0">
          {/* "units" gets the real UnitsWorkspace panel (rendered by the
              parent) instead of this placeholder whenever that panel is
              actually open (desktop) — see the module doc comment above. */}
          {!leftPanelOpen && (
            <ViewerModuleLayer activeModule={activeModule} onClose={() => onActiveModuleChange("explore")} />
          )}
          {sunTimeBounds && sunTimeline && sunTimePresets && (
            <SunTimeWorkspace
              activeModule={activeModule}
              isDesktop={isDesktop}
              interactive={!!sunTimeInteractive}
              timeHours={viewerTimeHours ?? 12}
              simulationDate={simulationDate ?? new Date().toISOString()}
              bounds={sunTimeBounds}
              timeline={sunTimeline}
              presets={sunTimePresets}
              activePresetId={activeSunPreset ?? null}
              canReset={!!sunTimeCanReset}
              onTimeChange={(h) => onSunTimeChange?.(h)}
              onDateChange={(iso) => onSunDateChange?.(iso)}
              onPresetSelect={(p) => onSunPresetSelect?.(p)}
              onReset={() => onSunTimeReset?.()}
            />
          )}
          <ViewsWorkspace
            activeModule={activeModule}
            presets={cameraPresets ?? []}
            activePresetId={activeViewPresetId ?? null}
            onSelectPreset={(p) => onSelectViewPreset?.(p)}
          />
          <ViewerNavigation activeModule={activeModule} onSelect={onActiveModuleChange} sunTimeLabel={sunTimeLabel} />
        </div>
      </div>
    </div>
  );
}
