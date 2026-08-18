"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { gsap } from "gsap";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { SunTimePreset, SunTimeline } from "@/lib/sunPosition";
import type { CameraPreset, Unit } from "@/lib/types";
import type { UnitFilterState } from "../../units-workspace/unitFilters";
import { DOCK_DIMENSIONS, DOCK_MORPH_EASE, DOCK_MORPH_SHADOW, DOCK_MORPH_TIMING } from "../layoutState";
import type { ActiveModule } from "../types";
import { DockShell } from "./DockShell";
import { DockContent, type DockMode, type DockPopoverId } from "./DockContent";

type NavId = Exclude<ActiveModule, "none">;

function modeFor(activeModule: ActiveModule): DockMode {
  if (activeModule === "sunTime") return "sunTime";
  if (activeModule === "units") return "units";
  if (activeModule === "views") return "views";
  return "nav";
}

/**
 * Morphing Bottom Dock PRD (2026-08-18) — replaces `ViewerNavigation` +
 * `SunTimeWorkspace` + `UnitsBar` + `ViewsWorkspace` in `ViewerHUD.tsx`'s
 * render with one persistent dock that physically morphs between
 * Navigation (Explore/Units/Views/Time) and each module's own controls,
 * instead of a second panel opening above a static pill. Phase 1 shipped
 * Nav ↔ Time only; Phase 2 (this revision) ports Units and Views onto the
 * same dock too — all 4 nav items are now real `DockMode`s, and
 * `UnitsBar`/`ViewsWorkspace` are fully retired (left in place,
 * unreferenced, same convention `ViewerNavigation.tsx`/`SunTimeWorkspace
 * .tsx` already set in Phase 1). See the approved Phase 1 plan
 * (`/Users/mnrv/.claude/plans/immutable-noodling-cookie.md`) for the
 * original phasing rationale — this revision closes out the "later phase"
 * it deferred.
 *
 * State is still fully owned by `ProjectViewerRuntime` — `activeModule`/
 * `onActiveModuleChange`, the Units filter state, and the Views preset
 * selection all arrive as controlled props here exactly as they did for
 * the components this replaces, matching this codebase's established
 * "parent owns cross-cutting state, HUD children stay controlled"
 * convention. Only `transitioning` (§30's interaction lock) and
 * `openPopover` (Time's preset dropdown, Units' Surface/Rooms — at most
 * one open at once) are genuinely local — nothing
 * outside this dock needs to read either.
 *
 * No click-outside-closes-dock handler — that was tried once this session
 * on the old nav group and broke orbit-drag on the 3D canvas (a drag's
 * own `mousedown` read as "outside"). Closing works exactly 3 ways: the
 * back/× control inside a module's own content, re-clicking the active
 * nav item, or Escape (via the single listener below).
 */
export function ProjectViewerDock({
  activeModule,
  onActiveModuleChange,
  isDesktop,
  sunTimeInteractive,
  sunTimeBounds,
  sunTimeline,
  sunTimePresets,
  activeSunPreset,
  sunTimeCanReset,
  viewerTimeHours,
  onSunTimeChange,
  onSunPresetSelect,
  onSunTimeReset,
  units,
  unitFilters,
  onUnitFiltersChange,
  unitsListOpen,
  onToggleUnitsList,
  cameraPresets,
  activeViewPresetId,
  onSelectViewPreset,
}: {
  activeModule: ActiveModule;
  onActiveModuleChange: (module: ActiveModule) => void;
  isDesktop: boolean;
  sunTimeInteractive: boolean;
  sunTimeBounds?: { startHours: number; endHours: number; stepMinutes: number };
  sunTimeline?: SunTimeline;
  sunTimePresets?: SunTimePreset[];
  activeSunPreset: SunTimePreset["id"] | null;
  sunTimeCanReset: boolean;
  viewerTimeHours: number;
  onSunTimeChange: (hours: number) => void;
  onSunPresetSelect: (preset: SunTimePreset) => void;
  onSunTimeReset: () => void;
  units: Unit[];
  unitFilters: UnitFilterState;
  onUnitFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
  unitsListOpen: boolean;
  onToggleUnitsList: () => void;
  cameraPresets: CameraPreset[];
  activeViewPresetId: string | null;
  onSelectViewPreset: (preset: CameraPreset) => void;
}) {
  const reducedMotion = useEffectiveReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timelineTweenRef = useRef<gsap.core.Timeline | null>(null);
  const unlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sun-time data is derived synchronously from `viewerConfig` one level up
  // (see `ProjectViewerRuntime.tsx`'s own `useMemo`s) so it's realistically
  // always ready by the time this renders — this guard exists purely so a
  // theoretical gap can never strand the dock mid-morph into content that
  // has nothing to show, not because that gap is expected in practice.
  const timeDataReady = !!(sunTimeBounds && sunTimeline && sunTimePresets);
  const rawTargetMode = modeFor(activeModule);
  const targetMode: DockMode = rawTargetMode === "sunTime" && !timeDataReady ? "nav" : rawTargetMode;

  const [renderedMode, setRenderedMode] = useState<DockMode>(targetMode);
  const [transitioning, setTransitioning] = useState(false);
  const [openPopover, setOpenPopover] = useState<DockPopoverId | null>(null);

  const morphTo = useCallback(
    (nextMode: DockMode) => {
      const shell = shellRef.current;
      const content = contentRef.current;
      timelineTweenRef.current?.kill();
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);

      const lockSeconds = reducedMotion ? 0.1 : DOCK_MORPH_TIMING.transitionLock;
      // `transitioning`/`openPopover` only ever change from inside these
      // GSAP timeline callbacks (never a bare statement in this function's
      // own body) — this codebase's `react-hooks/set-state-in-effect` lint
      // rule traces into functions called synchronously from a `useEffect`
      // body (this one is, see the effect below) and rejects a setState
      // call it finds there; every other GSAP-driven effect in this file
      // tree (`ViewerHUD`'s own load sequence: `onComplete: () =>
      // setLoadSequenceDone(true)`) already only ever sets state from
      // inside a timeline callback for the same reason.
      const onStart = () => {
        setTransitioning(true);
        // Any open Surface/Rooms/preset popover belongs to
        // whichever module is being left — closing it here (rather than
        // leaving it to whatever the new module happens to render) means a
        // stale popover can never survive a mode switch.
        setOpenPopover(null);
      };
      const onComplete = () => {
        setTransitioning(false);
        unlockTimeoutRef.current = null;
        // Direct instruction (2026-08-18) — "premium animation if the dock
        // gets bigger or smaller": the elevation lift below is applied via
        // inline styles so it can tween independently of the width/height
        // morph's own timing; clearing it once everything has settled
        // keeps the shell's real CSS (`.viewer-glass`'s own resting
        // shadow) the source of truth again rather than a stale inline
        // value that happens to match it.
        if (shell) gsap.set(shell, { clearProps: "boxShadow,y" });
      };
      // The lock's own duration is independent of this timeline's actual
      // visual length (§30's own point — a slow paint can't outrun it) —
      // `onComplete` above still clears it early if the timeline finishes
      // first, and this backstop covers the far more likely case where the
      // timeline is what finishes first, well under the lock's own window.
      unlockTimeoutRef.current = setTimeout(() => setTransitioning(false), lockSeconds * 1000);

      // `"nav"`/`"views"` have no stored width (see `DOCK_DIMENSIONS`'s own
      // doc comment) — `"auto"` here is just this function's own marker for
      // "measure the real incoming content and tween to that", handled
      // further down; it's deliberately *not* handed straight to GSAP's
      // own built-in `width: "auto"` resolution any more (see that branch's
      // own doc comment for the real bug that taught this).
      const targetWidth: number | "auto" | null = isDesktop
        ? nextMode === "sunTime"
          ? DOCK_DIMENSIONS.sunTime.widthDesktop
          : nextMode === "units"
            ? DOCK_DIMENSIONS.units.widthDesktop
            : "auto"
        : null;

      if (!shell || !content) {
        // No DOM yet (first paint) — just jump straight to the target
        // mode/width with no animation to attach to.
        const tl = gsap.timeline({ onStart, onComplete });
        timelineTweenRef.current = tl;
        tl.call(() => {
          setRenderedMode(nextMode);
          if (shell && targetWidth != null) gsap.set(shell, { width: targetWidth });
        });
        return;
      }

      if (reducedMotion) {
        // §29 — functionality identical, motion compressed to ~100ms,
        // no stagger, no scale, no elevation lift (that's pure flourish,
        // exactly what reduced-motion strips). The `requestAnimationFrame`
        // between the mode swap and the size correction matters even here
        // — see the real bug documented on the `targetWidth === "auto"`
        // branch below; measuring/setting `width`/`height` in the exact
        // same synchronous tick as `setRenderedMode` risks reading the
        // DOM before React has actually re-rendered the new mode's content.
        const tl = gsap.timeline({ onStart, onComplete });
        timelineTweenRef.current = tl;
        tl.to(content, { autoAlpha: 0, duration: 0.05 })
          .call(() => {
            setRenderedMode(nextMode);
            requestAnimationFrame(() => {
              const el = shellRef.current;
              if (!el) return;
              if (typeof targetWidth === "number") gsap.set(el, { width: targetWidth });
              else if (targetWidth === "auto") gsap.set(el, { width: "auto" });
              else if (!isDesktop) gsap.set(el, { height: "auto" });
            });
          })
          .to(content, { autoAlpha: 1, duration: 0.05 });
        return;
      }

      // Mobile's own height is content-driven (`DockShell`'s `h-auto`
      // below `lg`) and has never had a real pixel value pinned to it
      // before now — lock the *current* rendered height as a literal
      // number right before anything below changes the DOM, so the height
      // tween later in this timeline has a real numeric `from` to animate
      // out of instead of a CSS `auto` it can't interpolate directly.
      if (!isDesktop) {
        gsap.set(shell, { height: shell.getBoundingClientRect().height });
      }

      const tl = gsap.timeline({ onStart, onComplete });
      timelineTweenRef.current = tl;

      // §5 Phase 2 — outgoing content fades/lifts.
      tl.to(content, { autoAlpha: 0, y: 6, duration: DOCK_MORPH_TIMING.navCollapse, ease: "power1.in" }, 0);

      // Mode swap, mid-timeline while content is invisible — not
      // synchronous on click (phase 2 would have nothing to fade) and not
      // after the whole timeline (phase 4's reveal would be a no-op).
      tl.call(() => setRenderedMode(nextMode), [], DOCK_MORPH_TIMING.navCollapse);

      // §6 Phase 3 — shell width morph (desktop, fixed-pixel targets only:
      // Time/Units). Starting this early (well before the mode-swap `tl
      // .call` above actually lands) is safe here specifically because a
      // literal pixel number doesn't need to read the DOM at all — unlike
      // the `"auto"` case (Nav/Views), handled separately below.
      if (typeof targetWidth === "number") {
        tl.to(
          shell,
          { width: targetWidth, duration: DOCK_MORPH_TIMING.containerMorph, ease: DOCK_MORPH_EASE },
          DOCK_MORPH_TIMING.navCollapse * 0.7
        );
      }

      // Direct instruction (2026-08-18) — "premium animation if the dock
      // gets bigger or smaller": an elevation cue (deeper shadow + a small
      // -3px lift) synced to the resize itself, settling back down right
      // after — see `DOCK_MORPH_SHADOW`'s own doc comment for why this
      // isn't the bounce/overshoot PRD §37 rules out. Runs alongside the
      // width tween above (desktop) and the height tween below (mobile)
      // either way, so every mode switch that actually changes the dock's
      // footprint gets it, not just Time's.
      tl.to(
        shell,
        { boxShadow: DOCK_MORPH_SHADOW.lifted, y: -3, duration: DOCK_MORPH_TIMING.containerMorph * 0.6, ease: "power2.out" },
        DOCK_MORPH_TIMING.navCollapse * 0.7
      ).to(shell, { boxShadow: DOCK_MORPH_SHADOW.rest, y: 0, duration: DOCK_MORPH_TIMING.containerMorph * 0.7, ease: "power2.inOut" });

      // §7 Phase 4 — incoming content staggers in. Queried at call time
      // (not pre-bound), so this reads whatever DOM the mode-swap call
      // above actually produced, not whatever existed when this timeline
      // was built.
      tl.call(
        () => {
          const el = contentRef.current;
          if (!el) return;
          gsap.set(el, { autoAlpha: 1 });
          gsap.fromTo(
            el.children,
            { autoAlpha: 0, y: 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: DOCK_MORPH_TIMING.contentRevealItem,
              stagger: DOCK_MORPH_TIMING.contentRevealStagger,
              ease: "power2.out",
            }
          );
          // Mobile's own container-morph — the new content's real natural
          // height (`el.scrollHeight`, now that it's really mounted) is the
          // tween's target; `clearProps` once it lands hands sizing back to
          // plain CSS `h-auto` so a later in-place reflow (e.g. a longer
          // translated string) isn't fighting a stale inline pixel height.
          if (!isDesktop) {
            const targetHeight = el.scrollHeight;
            gsap.to(shellRef.current, {
              height: targetHeight,
              duration: DOCK_MORPH_TIMING.containerMorph,
              ease: DOCK_MORPH_EASE,
              onComplete: () => gsap.set(shellRef.current, { height: "auto" }),
            });
          }

          // §6 Phase 3, `"auto"` targets (Nav/Views) — real bug found
          // live-testing: GSAP's own `width: "auto"` special-case resolves
          // by measuring the shell's *current* DOM at the moment that tween
          // starts, and the naive version of this (a `tl.to(shell, {width:
          // "auto"}, navCollapse * 0.7)` positioned like the fixed-pixel
          // case above) starts *before* the mode-swap `tl.call` above has
          // actually landed — so it measured whichever module's content was
          // still on screen at that instant, not the incoming one. Leaving
          // Units (every child `shrink-0`, nothing able to compress) was
          // the clearest case: closing it measured Units' own unconstrained
          // width (~1120px, well past both the 760px it was leaving and
          // the ~430px Nav was actually heading to) and visibly ballooned
          // the whole dock out past both before snapping back down —
          // confirmed via a 5ms-resolution width trace, not just a visual
          // guess. Fixed the same way the mobile height tween above already
          // is: measure manually, right here, now that `el` (== the real
          // new content) is confirmed already mounted, then tween to that
          // real number instead of trusting GSAP's own auto-timing for it.
          if (targetWidth === "auto" && shellRef.current) {
            const shellEl = shellRef.current;
            const prevWidth = shellEl.getBoundingClientRect().width;
            gsap.set(shellEl, { width: "auto" });
            const measuredWidth = shellEl.getBoundingClientRect().width;
            gsap.set(shellEl, { width: prevWidth });
            gsap.to(shellEl, {
              width: measuredWidth,
              duration: DOCK_MORPH_TIMING.containerMorph,
              ease: DOCK_MORPH_EASE,
            });
          }
        },
        [],
        DOCK_MORPH_TIMING.navCollapse + DOCK_MORPH_TIMING.containerMorph * 0.4
      );
    },
    [isDesktop, reducedMotion]
  );

  // Reacts to `activeModule` (the real, parent-owned state) rather than
  // driving the morph imperatively from inside click handlers — keeps
  // this dock a genuinely controlled component: whatever sets
  // `activeModule` (a nav click, Escape, a future deep-link) morphs the
  // same way. Every other GSAP effect in this file tree (`ViewerHUD`'s
  // own load sequence, `UnitsWorkspace`'s width tween) follows the same
  // "useEffect + imperative gsap call" shape for the same reason: this
  // can't be expressed as pure render.
  useEffect(() => {
    if (targetMode === renderedMode) return;
    morphTo(targetMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode]);

  useEffect(() => {
    return () => {
      timelineTweenRef.current?.kill();
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
    };
  }, []);

  // Every click that could change `activeModule` routes through here —
  // §30's interaction lock rejects repeat clicks for the lock's own
  // duration, not just "however long the animation visually takes",
  // giving a slow paint no way to outrun it.
  const guardedChange = useCallback(
    (module: ActiveModule) => {
      if (transitioning) return;
      onActiveModuleChange(module);
    },
    [transitioning, onActiveModuleChange]
  );
  const handleSelectNav = useCallback((id: NavId) => guardedChange(id), [guardedChange]);
  const handleBack = useCallback(() => guardedChange("explore"), [guardedChange]);

  const handleTogglePopover = useCallback((id: DockPopoverId) => {
    setOpenPopover((current) => (current === id ? null : id));
  }, []);
  const handleClosePopover = useCallback(() => setOpenPopover(null), []);

  // PRD §32 — Escape closes Popover → Module → Navigation, one layer per
  // press. A single listener (not one per layer) is load-bearing here,
  // not a style choice — see `useEscapeKey.ts`'s own doc comment for why
  // 3 independent listeners would all fire on the same keypress.
  useEscapeKey(
    renderedMode !== "nav" || openPopover !== null,
    useCallback(() => {
      if (openPopover !== null) {
        setOpenPopover(null);
      } else if (renderedMode !== "nav") {
        handleBack();
      }
    }, [openPopover, renderedMode, handleBack])
  );

  return (
    <DockShell ref={shellRef} className={isDesktop ? undefined : "w-full"}>
      <DockContent
        ref={contentRef}
        mode={renderedMode}
        activeModule={activeModule}
        onSelectNav={handleSelectNav}
        isDesktop={isDesktop}
        interactive={sunTimeInteractive}
        timeHours={viewerTimeHours}
        bounds={sunTimeBounds ?? { startHours: 6, endHours: 21, stepMinutes: 15 }}
        timeline={sunTimeline ?? { sunriseHour: null, sunsetHour: null, solarNoonHour: 12, alwaysUp: false, alwaysDown: false }}
        presets={sunTimePresets ?? []}
        activePresetId={activeSunPreset}
        canReset={sunTimeCanReset}
        onTimeChange={onSunTimeChange}
        onPresetSelect={onSunPresetSelect}
        onReset={onSunTimeReset}
        units={units}
        unitFilters={unitFilters}
        onUnitFiltersChange={onUnitFiltersChange}
        unitsListOpen={unitsListOpen}
        onToggleUnitsList={onToggleUnitsList}
        cameraPresets={cameraPresets}
        activeViewPresetId={activeViewPresetId}
        onSelectViewPreset={onSelectViewPreset}
        onBack={handleBack}
        onClose={handleBack}
        openPopover={openPopover}
        onTogglePopover={handleTogglePopover}
        onClosePopover={handleClosePopover}
      />
    </DockShell>
  );
}
