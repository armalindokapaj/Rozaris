"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { gsap } from "gsap";
import { Moon, RotateCcw, Sun, Sunrise, Sunset, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { clamp, cn } from "@/lib/utils";
import type { SunTimePreset, SunTimeline } from "@/lib/sunPosition";
import type { ActiveModule } from "../viewer-hud/types";

/** Exported for ViewsWorkspace's own compact "Sun & Time · 14:30" readout
 * (2026-08-17 redesign) — one shared formatter rather than a second copy
 * of the same carry-safe HH:MM logic. */
export function formatHM(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.round((norm - h) * 60);
  // A round-up to 60 (e.g. 16.999h) should carry into the hour, not print "16:60".
  const carry = m === 60;
  return `${String(carry ? (h + 1) % 24 : h).padStart(2, "0")}:${String(carry ? 0 : m).padStart(2, "0")}`;
}

const PRESET_LABEL_KEY: Record<SunTimePreset["id"], string> = {
  morning: "sunTime.presetMorning",
  noon: "sunTime.presetNoon",
  goldenHour: "sunTime.presetGoldenHour",
  evening: "sunTime.presetEvening",
};

/** Icon per real preset (2026-08-17 redesign) — the reference render's own
 * preset row used generic "Morning/Afternoon/Evening/Night" placeholders
 * that don't match this app's actual four presets (Morning/Noon/Golden
 * Hour/Evening, each tied to a real point on the sun's real elevation
 * curve — see sunPosition.ts). Renaming "Golden Hour" to "Night" to match
 * the mockup's wording would be factually wrong (golden hour is warm
 * daylight, not darkness), so the visual *style* is matched but the real
 * labels/data are kept; icons chosen to still read as a clear morning→
 * noon→golden-hour→evening progression. */
const PRESET_ICON: Record<SunTimePreset["id"], typeof Sun> = {
  morning: Sunrise,
  noon: Sun,
  goldenHour: Sunset,
  evening: Moon,
};

/**
 * Sun & Time PRD (2026-08-16), §7 "Main Desktop Interface" / §36 "Mobile
 * Interface" — the real interactive panel that opens above the bottom nav
 * when Sun & Time is active. Mirrors ViewerModuleLayer's own "stays
 * permanently mounted, animates via GSAP autoAlpha/y keyed off `open`"
 * pattern (see that component's doc comment) rather than conditional
 * rendering, for the same reason: an instant unmount would skip the close
 * tween. ViewerModuleLayer itself now excludes "sunTime" from its own
 * `open` check (see its doc comment) so the two panels never show at once.
 *
 * Scope trims made building this (both flagged, neither in the reference
 * renders provided): §34/§38's "auto-minimize to a compact readout after
 * 2-4s idle" isn't implemented — the panel's open/closed state is tied
 * only to `activeModule`, same as every other module panel in this file
 * tree. §35's compact "16:35 · 21 June" idle-bottom-nav readout also isn't
 * shown any more — ViewerNavigation's own rebuild (2026-08-17, direct
 * design reference) dropped that inline label along with its old
 * hover/tap-expand mechanic in favor of a fixed icon+label pill.
 *
 * Date picker removed entirely (direct design feedback, 2026-08-17: "Date
 * to be removed", both bars) — `simulationDate`/`onDateChange` were
 * dropped from this component's own props along with it (nothing left
 * here to read or call them). The real value/write-path they used to
 * carry didn't disappear, just moved to live one level up only:
 * `effectiveSunDate`'s real sunrise/sunset math still runs in
 * ProjectViewerRuntime (feeds `environmentConfig` → the actual 3D sun position)
 * regardless of whether any UI can currently change it — PRD §29's live-
 * date-override capability (`liveSunDate`/`setLiveSunDate`) stays real
 * too, just with no trigger wired to it right now (ProjectViewerRuntime's own
 * `handleSunDateChange` was removed as dead code alongside this; a future
 * date control anywhere in the app can call `setLiveSunDate` directly
 * again without any of this needing to be rebuilt).
 */
export function SunTimeWorkspace({
  activeModule,
  isDesktop,
  interactive,
  timeHours,
  bounds,
  timeline,
  presets,
  activePresetId,
  canReset,
  onTimeChange,
  onPresetSelect,
  onReset,
  onClose,
}: {
  activeModule: ActiveModule;
  isDesktop: boolean;
  interactive: boolean;
  timeHours: number;
  bounds: { startHours: number; endHours: number; stepMinutes: number };
  timeline: SunTimeline;
  presets: SunTimePreset[];
  activePresetId: SunTimePreset["id"] | null;
  canReset: boolean;
  onTimeChange: (hours: number) => void;
  onPresetSelect: (preset: SunTimePreset) => void;
  onReset: () => void;
  /** Desktop bar's own × (2026-08-18) — same handler ViewerHUD's click-
   * outside and re-tapping "Time" both already call. */
  onClose: () => void;
}) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activeModule === "sunTime";

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

  function handleSliderInput(e: ChangeEvent<HTMLInputElement>) {
    onTimeChange(clamp(Number(e.target.value), bounds.startHours, bounds.endHours));
  }

  // Value-based fill (was a static always-100%-width dawn→dusk rainbow
  // gradient) — direct design reference, 2026-08-17: a solid brand-color
  // fill that stops at the thumb, matching every other slider/progress
  // affordance this pass's purple accent language already uses elsewhere
  // (bottom nav's active underline, Views' active preset, etc.) rather
  // than a one-off multi-color gradient found nowhere else in the app.
  const fillPercent = clamp(((timeHours - bounds.startHours) / Math.max(1e-6, bounds.endHours - bounds.startHours)) * 100, 0, 100);
  // Decorative tick row under the track, per the reference — purely
  // visual (not individually interactive; the real input handles the
  // actual dragging/keyboard control above it).
  const TICK_COUNT = 12;

  const sliderTrack = (
    <div>
      <div className="relative flex h-5 items-center">
        <div className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-brand-400"
            style={{ width: `${fillPercent}%`, opacity: interactive ? 1 : 0.35 }}
          />
        </div>
        <input
          type="range"
          min={bounds.startHours}
          max={bounds.endHours}
          step={Math.max(bounds.stepMinutes, 1) / 60}
          value={timeHours}
          onChange={handleSliderInput}
          disabled={!interactive}
          aria-label={t("sunTime.title")}
          className="rz-range-thumb disabled:cursor-not-allowed"
        />
      </div>
      <div className="mt-1 flex justify-between px-0.5" aria-hidden="true">
        {Array.from({ length: TICK_COUNT }).map((_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-white/15" />
        ))}
      </div>
    </div>
  );

  const resetButton = (
    <button
      type="button"
      onClick={onReset}
      disabled={!canReset}
      className="viewer-glass flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3 text-xs font-medium text-white transition-opacity disabled:opacity-40"
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      {t("sunTime.reset")}
    </button>
  );

  // Extracted from the buttons' own wrapper (2026-08-17, mobile redesign)
  // so desktop and mobile can lay the exact same 4 real buttons out
  // differently — desktop keeps its horizontal scroll row, mobile now
  // groups all 4 into one bordered 2x2 "box" (see `presetGrid` below,
  // direct design feedback: "all 4 presets to be inside the box").
  const presetButtons = presets.map((preset) => {
    const isActive = activePresetId === preset.id;
    const PresetIcon = PRESET_ICON[preset.id];
    return (
      <button
        key={preset.id}
        type="button"
        onClick={() => onPresetSelect(preset)}
        disabled={!interactive}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          isActive ? "bg-brand-500 text-white" : "border border-white/15 text-white/75 hover:border-white/25 hover:text-white"
        )}
      >
        <PresetIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t(PRESET_LABEL_KEY[preset.id])}
      </button>
    );
  });

  // Both branches now share this single 2x2 grid (direct design feedback,
  // 2026-08-17: desktop's separate scrollable single-row `presetRow` —
  // itself a fix for a real `flex-wrap`/`w-fit` clipping bug — was
  // replaced by the same box-of-4 the mobile sheet already used, once
  // desktop also wanted "all 4 presets 2x2" instead of a scrolling row).
  // 2 columns comfortably fit all 4 with no need to scroll.
  const presetGrid = (
    <div className="grid grid-cols-2 gap-1.5 rounded-control border border-white/10 bg-white/[0.03] p-1.5 [&>button]:justify-center">
      {presetButtons}
    </div>
  );

  if (isDesktop) {
    return (
      <div
        ref={panelRef}
        role="group"
        aria-label={t("sunTime.title")}
        aria-hidden={!open}
        className={cn(
          // Fixed `w-[632px]` (not `w-fit`) — same "w-fit under-measures a
          // busy flex row" Chromium bug UnitsBar's own doc comment already
          // documents in detail, reproduced here too every time this row's
          // content changed shape (real, verified via per-child
          // getBoundingClientRect, not `scrollWidth`/`offsetWidth` — those
          // two saturate at the container's own size and can't detect a
          // container *wider* than its content, only narrower; only the
          // per-child-rect technique catches both directions). No
          // `h-[60px]` any more — the title zone and "Presets" label are
          // both gone (direct design feedback, 2026-08-17) and the 4
          // presets are now a 2x2 grid, taller than the old single-row
          // layout the fixed 60px height was tuned for; `py-2.5` +
          // `items-stretch` (default, left implicit) lets the bar's own
          // height follow whichever zone is tallest instead — this is the
          // real ~102px this panel now naturally renders at, and the
          // value ViewsWorkspace/UnitsBar's own desktop bars were given an
          // explicit `min-h-[104px]` to match (direct instruction
          // 2026-08-18: "I liked the idea of the height of the Time
          // Menu... make it default for units, views, Time"); this bar
          // keeps deriving its height from content rather than also
          // switching to a fixed `min-h`, since content is *why* the
          // shared value is what it is — an explicit `min-h-[104px]` sits
          // alongside `py-2.5` here too, purely so the "104px is the
          // shared default" convention is visible in this file as well,
          // not just the two bars that actually needed the floor raised.
          // Width re-measured 720px→672px→592px (direct design feedback,
          // 2026-08-17: "remove empty space on the right") after the
          // compact reset button was removed from the Presets zone (below:
          // "remove reset button on the right") — the 672px step was a
          // guess made without re-measuring and left a real ~99px empty
          // gap after the preset grid (confirmed live); 592px was content's
          // own real last pixel (573px) plus the same 16px `sm:px-4` the
          // left side already uses. 632px adds the new ×  zone's own real
          // measured width (divider + its own padding/icon) on top, same
          // technique.
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex min-h-[104px] w-[632px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-panel px-3.5 py-2.5 opacity-0 ring-2 ring-brand-400/50 sm:px-4",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {/* Slider zone — sunrise/sunset real values flank the real
            interactive track, same as the pre-redesign layout; just
            arranged inline instead of stacked above it. Fixed `w-72` (not
            `flex-1`) — real bug found live-testing: a `flex-1` item
            inside this bar's `w-fit` outer container made the browser's
            fit-content sizing under-allocate space for everything after
            it, silently clipping the last ~300px of the Presets zone
            (only Morning/Noon were visible; Golden Hour/Evening/date/
            reset all existed in the DOM but sat past the container's own
            right edge). A fixed width removes the ambiguity entirely —
            same reason ViewsWorkspace's own `w-fit` bar never needed
            `flex-1` anywhere. */}
        <div className="flex w-72 shrink-0 flex-col justify-center gap-1 px-4">
          <div className="flex items-center gap-3">
            <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-white/70">
              <Sunrise className="h-4 w-4 shrink-0" aria-hidden="true" />
              {timeline.sunriseHour != null ? formatHM(timeline.sunriseHour) : "—"}
            </span>
            <div className="flex-1">{sliderTrack}</div>
            <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-brand-400">
              <Sun className="h-4 w-4 shrink-0 fill-brand-400/40" aria-hidden="true" />
              {timeline.sunsetHour != null ? formatHM(timeline.sunsetHour) : "—"}
            </span>
          </div>
          {!interactive && <p className="text-[11px] text-white/35">{t("sunTime.readOnlyHint")}</p>}
        </div>

        <span className="my-1 w-px shrink-0 bg-white/10" aria-hidden="true" />

        {/* Presets zone — real Morning/Noon/Golden Hour/Evening presets
            (see PRESET_ICON's own doc comment for why the reference
            mockup's generic labels weren't copied verbatim). "Presets"
            label removed and the row remodeled into the same 2x2
            `presetGrid` box the mobile sheet already used (direct design
            feedback, 2026-08-17: "remove text Presets" / "remodel to have
            all 4 presets 2x2 view") — one shared grid for both branches
            now instead of desktop's own separate scrollable `presetRow`.
            The desktop bar's own compact reset trigger that used to sit
            beside the grid was removed entirely (direct instruction,
            2026-08-17: "remove reset button on the right") — the mobile
            sheet's icon+text `resetButton` is unaffected, this only
            dropped the desktop-only compact variant, since removing it
            is what the paired "remove empty space on the right"
            instruction was about (the bar's fixed width above shrank to
            match). */}
        <div className="flex shrink-0 items-center pl-3.5 sm:pl-4">{presetGrid}</div>

        <span className="my-1 w-px shrink-0 bg-white/10" aria-hidden="true" />

        {/* × zone (2026-08-18, reinstated alongside Units/Views' own) —
            trailing so it inherits the container's own right-edge
            `px-3.5`/`sm:px-4` for free, same as every other bar's last
            zone. */}
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

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("sunTime.title")}
      aria-hidden={!open}
      className={cn(
        // Same mobile shell formula as UnitsBar's own mobile branch,
        // verbatim (direct instruction, 2026-08-17: "check every distance
        // and alignment... seamless") — this branch used to be a plain
        // `p-3.5` with no drag-handle affordance, a real inconsistency
        // against UnitsBar's `px-4 pb-4 pt-2.5` + handle that made
        // switching Units → Time feel like two different sheet designs
        // rather than one consistent pattern.
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel px-4 pb-4 pt-2.5 opacity-0",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Drag-handle affordance — decorative only, same as UnitsBar's own
          (see that component's doc comment); every mobile sheet in this
          file tree now opens with the identical handle. */}
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />
      {/* Date removed (direct design feedback, 2026-08-17: "the date to be
          removed") — just the live time value + reset now, same trim the
          desktop bar got. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums text-white">{formatHM(timeHours)}</span>
        {resetButton}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] text-white/40">
          {timeline.sunriseHour != null ? formatHM(timeline.sunriseHour) : "—"}
        </span>
        <div className="flex-1">{sliderTrack}</div>
        <span className="shrink-0 text-[10px] text-white/40">
          {timeline.sunsetHour != null ? formatHM(timeline.sunsetHour) : "—"}
        </span>
      </div>
      {!interactive && <p className="mt-2 text-[11px] text-white/35">{t("sunTime.readOnlyHint")}</p>}
      {/* Presets grouped into one 2x2 box (direct design feedback: "all 4
          presets to be inside the box, not with slider on the right") —
          see `presetGrid`'s own doc comment; desktop adopted the same box
          shortly after. */}
      <div className="mt-2.5">{presetGrid}</div>
    </div>
  );
}
