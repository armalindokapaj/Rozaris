"use client";

import { forwardRef, useRef, type ChangeEvent } from "react";
import { gsap } from "gsap";
import { Check, ChevronDown, Moon, RotateCcw, Sun, Sunrise, Sunset, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { clamp, cn } from "@/lib/utils";
import type { SunTimePreset } from "@/lib/sunPosition";
import { DOCK_MORPH_TIMING } from "../layoutState";
import { DockPopover } from "./DockPopover";

/** Duplicated from (soon-unreferenced) `SunTimeWorkspace.tsx` rather than
 * imported from it — that component is left in place only as a reference
 * for a later phase, not rendered by `ViewerHUD.tsx` any more once this
 * dock ships (see `ProjectViewerDock.tsx`'s own doc comment), so importing
 * from it would be a live dependency on a file nothing else uses. */
function formatHM(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.round((norm - h) * 60);
  const carry = m === 60;
  return `${String(carry ? (h + 1) % 24 : h).padStart(2, "0")}:${String(carry ? 0 : m).padStart(2, "0")}`;
}

const PRESET_LABEL_KEY: Record<SunTimePreset["id"], string> = {
  morning: "sunTime.presetMorning",
  noon: "sunTime.presetNoon",
  goldenHour: "sunTime.presetGoldenHour",
  evening: "sunTime.presetEvening",
};

const PRESET_ICON: Record<SunTimePreset["id"], typeof Sun> = {
  morning: Sunrise,
  noon: Sun,
  goldenHour: Sunset,
  evening: Moon,
};

/**
 * Morphing Bottom Dock PRD §8-9 "Time Dock" — desktop:
 * `03:11 ──●── 18:10   Golden Hour ▾   ×`, one row, fits the dock's shared
 * 62px height (see `layoutState.ts`'s `DOCK_HEIGHT_DESKTOP` doc comment for
 * why this no longer needs the taller ~104px the pre-dock `SunTimeWorkspace`
 * bar had) — the always-visible 2×2 preset grid that pushed that bar's
 * height past 62px becomes a single popover trigger here instead, PRD §8's
 * own wording ("display only Golden Hour ▾... clicking opens a compact
 * popover"). No back control (2026-08-18 direct instruction: "remove text
 * time and the sign back at the left side") — exiting Time is Escape,
 * re-clicking the active "Time" nav item, or this row's own ×.
 *
 * Mobile keeps a 2-row layout close to `SunTimeWorkspace`'s own existing
 * mobile sheet (preset-trigger/reset/× row, then a full-width slider row,
 * same back-less top row as desktop) — full mobile choreography/spacing
 * polish is deferred to a later phase per the approved plan; this ports
 * today's shape rather than redesigning it fresh.
 *
 * `forwardRef`, attached directly to this component's own root div (no
 * extra wrapper) — `ProjectViewerDock`'s content-reveal animation targets
 * `ref.current.children` (sunrise/slider/sunset/preset/× on desktop)
 * directly, so an intermediate wrapper div here would leave only 1 child
 * to "stagger".
 */
export const TimeContent = forwardRef<
  HTMLDivElement,
  {
    isDesktop: boolean;
    interactive: boolean;
    timeHours: number;
    bounds: { startHours: number; endHours: number; stepMinutes: number };
    presets: SunTimePreset[];
    activePresetId: SunTimePreset["id"] | null;
    canReset: boolean;
    onTimeChange: (hours: number) => void;
    onPresetSelect: (preset: SunTimePreset) => void;
    onReset: () => void;
    /** Still received from `DockContent` (which still receives it from
     * `ProjectViewerDock`, unchanged) even though this component no longer
     * renders a back control itself (2026-08-18: "remove text time and the
     * sign back at the left side") — Escape and re-clicking the active nav
     * item both still return to Explore via the same handler on the
     * orchestrator side; only this component's own on-canvas button is
     * gone. Kept in the prop type for parity with `UnitsContent`/
     * `ViewsContent`, which still take it. */
    onBack: () => void;
    onClose: () => void;
    popoverOpen: boolean;
    onTogglePopover: () => void;
    onClosePopover: () => void;
  }
>(function TimeContent(
  {
    isDesktop,
    interactive,
    timeHours,
    bounds,
    presets,
    activePresetId,
    canReset,
    onTimeChange,
    onPresetSelect,
    onReset,
    onClose,
    popoverOpen,
    onTogglePopover,
    onClosePopover,
  },
  ref
) {
  const { t } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  // So `mousedown` on the preset trigger is not read as a click outside
  // its own popover — see `DockPopover`'s own note.
  const presetTriggerRef = useRef<HTMLButtonElement>(null);

  function handleSliderInput(e: ChangeEvent<HTMLInputElement>) {
    tweenRef.current?.kill();
    onTimeChange(clamp(Number(e.target.value), bounds.startHours, bounds.endHours));
  }

  // PRD §9 — a selected preset's time (and everything downstream that
  // reads it — sun direction, shadows, atmosphere) interpolates rather
  // than jumps. Drives the *real* `onTimeChange` every animation frame
  // (not a locally-echoed value) so there is still only one time-state,
  // per §33-34 — this differs from `SunTimeWorkspace.tsx`'s own
  // `handleSunPresetSelect`, which used to jump `liveSunTimeHours`
  // instantly; `onPresetSelect` itself (still the real
  // `ProjectViewerRuntime.handleSunPresetSelect`) now only fires once the
  // tween completes, which is what actually sets `activeSunPreset` —
  // during the ~0.75s tween the preset briefly reads as "none selected"
  // rather than falsely showing the target preset as already active,
  // matching a real "traveling toward it" feel rather than a lie.
  function handlePresetSelect(preset: SunTimePreset) {
    onClosePopover();
    const proxy = { value: timeHours };
    tweenRef.current = gsap.to(proxy, {
      value: preset.hour,
      duration: reducedMotion ? 0.05 : DOCK_MORPH_TIMING.presetTween,
      ease: "power2.inOut",
      onUpdate: () => onTimeChange(proxy.value),
      onComplete: () => onPresetSelect(preset),
    });
  }

  const fillPercent = clamp(((timeHours - bounds.startHours) / Math.max(1e-6, bounds.endHours - bounds.startHours)) * 100, 0, 100);

  const sliderTrack = (
    <div className="relative flex h-5 flex-1 items-center">
      <div className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${fillPercent}%`, opacity: interactive ? 1 : 0.35 }} />
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
        className="rz-range-single disabled:cursor-not-allowed"
      />
    </div>
  );

  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  const presetTriggerLabel = activePreset ? t(PRESET_LABEL_KEY[activePreset.id]) : t("sunTime.presets");

  const presetPopoverList = (
    <div className="flex min-w-[152px] flex-col gap-0.5" role="menu" aria-label={t("sunTime.presets")}>
      {presets.map((preset) => {
        const isActive = activePresetId === preset.id;
        const PresetIcon = PRESET_ICON[preset.id];
        return (
          <button
            key={preset.id}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            disabled={!interactive}
            onClick={() => handlePresetSelect(preset)}
            className={cn(
              "flex items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              isActive ? "bg-brand-500/10 text-brand-400" : "text-white/75 hover:bg-white/5 hover:text-white"
            )}
          >
            <PresetIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{t(PRESET_LABEL_KEY[preset.id])}</span>
            {isActive && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );

  // Purple, not the neutral white/50→white every other icon-only button in
  // this dock uses (2026-08-18 direct instruction: "make the X [close
  // button] in Purple", desktop and mobile both — this component doesn't
  // branch its `closeButton` by device, so one change covers both).
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("common.close")}
      title={t("common.close")}
      className="flex shrink-0 items-center rounded-control px-1.5 text-brand-400 transition-colors hover:text-brand-300"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // Desktop's trailing divider ("the line between presets and ×") is
  // deliberately a child of *this* relative wrapper rather than a sibling
  // out in the row (2026-08-18 direct instruction: "Fix Presets dropdown
  // menu, aligned with the line between presets and X") — `DockPopover`'s
  // `anchorClassName="right-0"` resolves against this wrapper's own right
  // edge, so folding the divider in here (instead of leaving it as the
  // row's next flex child, after this wrapper) moves that edge from the
  // trigger button's own right edge out to the divider's, which is what
  // "aligned with the line" actually meant — the popover's right side now
  // sits flush with that same vertical line, not a `gap-3` short of it.
  // `isDesktop`-gated — mobile's own row has no adjacent × (a reset button
  // sits between preset trigger and ×), so there's no "line" there to
  // align to; folding it in unconditionally would just add a stray divider
  // to mobile's row that never existed before.
  const presetTrigger = (
    <div className="relative flex shrink-0 items-center gap-3">
      <button
        ref={presetTriggerRef}
        type="button"
        onClick={onTogglePopover}
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        disabled={!interactive}
        className="flex items-center gap-1.5 rounded-control px-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {presetTriggerLabel}
        <ChevronDown className={cn("h-3.5 w-3.5 text-white/50 transition-transform", popoverOpen && "rotate-180")} aria-hidden="true" />
      </button>
      {isDesktop && <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />}
      <DockPopover open={popoverOpen} onClose={onClosePopover} triggerRef={presetTriggerRef} anchorClassName="right-0">
        {presetPopoverList}
      </DockPopover>
    </div>
  );

  // Where the handle actually is. Solid white against the track ends'
  // white/40-to-brand pair so the live value reads as the answer and the
  // bounds as scale marks. Desktop leads with it; mobile drops it into
  // the left half of the existing top row (which was `justify-end` with
  // nothing on the left) rather than adding a third row — that row's
  // height is the whole dock's shared 72px, see the note below it.
  const liveTimeReadout = (
    <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{formatHM(timeHours)}</span>
  );

  // The two readouts flanking the track label the track's own ends —
  // Sun Path → Start Time/End Time — not sunrise/sunset, which is what
  // they showed until 2026-08-27. Those are different numbers (an admin
  // who sets 06:00-20:00 saw "03:11" and "18:10" on a June day in
  // Albania) and labelling a slider with values it cannot reach was the
  // bug. Sunrise/sunset are still offered, as presets.
  if (isDesktop) {
    return (
      <div ref={ref} className="flex h-full w-full items-center gap-3 px-3.5 sm:px-4">
        {liveTimeReadout}
        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
        <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-white/70">
          <Sunrise className="h-4 w-4 shrink-0" aria-hidden="true" />
          {formatHM(bounds.startHours)}
        </span>
        {sliderTrack}
        <span className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums text-brand-400">
          <Sun className="h-4 w-4 shrink-0 fill-brand-400/40" aria-hidden="true" />
          {formatHM(bounds.endHours)}
        </span>
        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />
        {presetTrigger}
        {closeButton}
      </div>
    );
  }

  // Direct instruction (2026-08-18): "Nav, Views, and Time now share
  // exactly 72px" (down from an earlier 82px pass) — Time is the one
  // mode whose real natural mobile content *defines* that shared value
  // (`DOCK_HEIGHT_MOBILE_STANDARD` in `layoutState.ts`; Nav/Views apply it
  // as a `min-height` floor instead of having their own real content that
  // size). Trimmed 10px out of this row's own natural height to land
  // there: `py-2.5`→`py-2` (-4px), `gap-2`→`gap-1.5` (-2px), and the reset
  // button `h-8`→`h-7` (-4px, still comfortably tappable). Re-measured via
  // `getBoundingClientRect()` after, not just eyeballed.
  return (
    <div ref={ref} className="flex w-full flex-col gap-1.5 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        {liveTimeReadout}
        {presetTrigger}
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-control border border-white/15 px-2.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {closeButton}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] text-white/40">{formatHM(bounds.startHours)}</span>
        {sliderTrack}
        <span className="shrink-0 text-[10px] text-white/40">{formatHM(bounds.endHours)}</span>
      </div>
      {!interactive && <p className="text-[11px] text-white/35">{t("sunTime.readOnlyHint")}</p>}
    </div>
  );
});
