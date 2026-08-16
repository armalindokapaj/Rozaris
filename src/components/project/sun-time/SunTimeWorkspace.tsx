"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { gsap } from "gsap";
import { Calendar, RotateCcw, Sun } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { useClickOutside } from "@/hooks/useClickOutside";
import { clamp, cn } from "@/lib/utils";
import type { SunTimePreset, SunTimeline } from "@/lib/sunPosition";
import type { ActiveModule } from "../viewer-hud/types";

function formatHM(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.round((norm - h) * 60);
  // A round-up to 60 (e.g. 16.999h) should carry into the hour, not print "16:60".
  const carry = m === 60;
  return `${String(carry ? (h + 1) % 24 : h).padStart(2, "0")}:${String(carry ? 0 : m).padStart(2, "0")}`;
}

/** Sun & Time PRD §9's "Afternoon"/"Sunset"-style period word under the
 * big time readout — not spec'd as an exact formula, just an example
 * (§44's render shows "Afternoon" at 16:42 with sunset at 20:16). This is
 * a reasonable approximation banded off the real sunrise/solar-noon/
 * sunset timeline, not a literal PRD requirement. */
function periodKey(hours: number, timeline: SunTimeline): string {
  if (timeline.alwaysUp) return "sunTime.periodAfternoon";
  if (timeline.alwaysDown) return "sunTime.periodNight";
  const { sunriseHour, sunsetHour, solarNoonHour } = timeline;
  if (sunriseHour == null || sunsetHour == null) return "sunTime.periodAfternoon";
  if (hours < sunriseHour || hours >= sunsetHour + 1) return "sunTime.periodNight";
  if (hours < sunriseHour + 1) return "sunTime.periodSunrise";
  if (hours >= sunsetHour) return "sunTime.periodSunset";
  if (hours >= sunsetHour - 1.5) return "sunTime.periodEvening";
  return hours < solarNoonHour ? "sunTime.periodMorning" : "sunTime.periodAfternoon";
}

const PRESET_LABEL_KEY: Record<SunTimePreset["id"], string> = {
  morning: "sunTime.presetMorning",
  noon: "sunTime.presetNoon",
  goldenHour: "sunTime.presetGoldenHour",
  evening: "sunTime.presetEvening",
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
 * tree. The nav pill's own hover/tap-expand label (ViewerNavigation) still
 * shows the compact "16:35 · 21 June" readout PRD §35 describes for the
 * *idle bottom-nav* state, which is the one behavior from that section
 * that was already built (Front Page PRD) and needed no new work here.
 */
export function SunTimeWorkspace({
  activeModule,
  isDesktop,
  interactive,
  timeHours,
  simulationDate,
  bounds,
  timeline,
  presets,
  activePresetId,
  canReset,
  onTimeChange,
  onDateChange,
  onPresetSelect,
  onReset,
}: {
  activeModule: ActiveModule;
  isDesktop: boolean;
  interactive: boolean;
  timeHours: number;
  simulationDate: string;
  bounds: { startHours: number; endHours: number; stepMinutes: number };
  timeline: SunTimeline;
  presets: SunTimePreset[];
  activePresetId: SunTimePreset["id"] | null;
  canReset: boolean;
  onTimeChange: (hours: number) => void;
  onDateChange: (iso: string) => void;
  onPresetSelect: (preset: SunTimePreset) => void;
  onReset: () => void;
}) {
  const { t, locale } = useT();
  const reducedMotion = useEffectiveReducedMotion();
  const mounted = useHasMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
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

  // Deliberately no separate "close the date popover when the whole panel
  // closes" effect — this codebase's react-hooks/set-state-in-effect and
  // react-hooks/refs rules both reject the usual ways to express that (a
  // synchronous setState in an effect, or the ref-during-render pattern
  // React's own docs otherwise recommend for it). In practice this is
  // already covered: switching to a different nav module is itself a
  // click outside `dateMenuRef`, which this handles below.
  useClickOutside(dateMenuRef, () => setDateMenuOpen(false), dateMenuOpen);

  const dateLabel = useMemo(() => {
    if (!mounted) return "";
    const d = new Date(simulationDate);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(d);
  }, [mounted, simulationDate, locale]);

  const quickDates = useMemo(() => {
    if (!mounted) return [];
    const year = new Date(simulationDate).getUTCFullYear() || new Date().getUTCFullYear();
    return [3, 6, 9, 12].map((month) => {
      const iso = new Date(Date.UTC(year, month - 1, 21)).toISOString();
      return { iso, label: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso)) };
    });
  }, [mounted, simulationDate, locale]);

  function handleSliderInput(e: ChangeEvent<HTMLInputElement>) {
    onTimeChange(clamp(Number(e.target.value), bounds.startHours, bounds.endHours));
  }

  const period = mounted ? t(periodKey(timeHours, timeline)) : "";

  const sliderTrack = (
    <div className="relative flex h-5 items-center">
      <div className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{
            width: "100%",
            background: "linear-gradient(90deg, #8973f8 0%, #f8b955 55%, #f8734f 100%)",
            opacity: interactive ? 1 : 0.35,
          }}
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

  const dateMenu = (
    <div ref={dateMenuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setDateMenuOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={dateMenuOpen}
        className="viewer-glass flex h-9 items-center gap-1.5 rounded-control px-3 text-xs font-medium text-white"
      >
        <Calendar className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
        {dateLabel}
      </button>
      {dateMenuOpen && (
        <div role="dialog" className="viewer-glass absolute bottom-[calc(100%+8px)] right-0 z-10 w-52 rounded-panel p-2">
          <div className="grid grid-cols-2 gap-1">
            {quickDates.map((qd) => (
              <button
                key={qd.iso}
                type="button"
                onClick={() => {
                  onDateChange(qd.iso);
                  setDateMenuOpen(false);
                }}
                className="rounded-control px-1.5 py-1.5 text-center text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {qd.label}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 px-1 pt-2 text-xs text-white/60">
            {t("sunTime.chooseDate")}
            <input
              type="date"
              value={simulationDate.slice(0, 10)}
              onChange={(e) => {
                if (!e.target.value) return;
                onDateChange(new Date(`${e.target.value}T00:00:00.000Z`).toISOString());
              }}
              className="rounded-control border border-white/15 bg-white/5 px-1.5 py-1 text-xs text-white [color-scheme:dark]"
            />
          </label>
        </div>
      )}
    </div>
  );

  const presetRow = (
    <div className={cn("flex gap-1.5", isDesktop ? "flex-wrap" : "overflow-x-auto pb-0.5")}>
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPresetSelect(preset)}
          disabled={!interactive}
          className={cn(
            "shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            activePresetId === preset.id ? "bg-brand-500 text-white" : "bg-white/10 text-white/75 hover:bg-white/15 hover:text-white"
          )}
        >
          {t(PRESET_LABEL_KEY[preset.id])}
        </button>
      ))}
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
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 rounded-panel p-4 opacity-0",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-end justify-between gap-3 text-white">
              <div className="flex flex-col items-start">
                <span className="text-sm tabular-nums text-white/70">
                  {timeline.sunriseHour != null ? formatHM(timeline.sunriseHour) : "—"}
                </span>
                <span className="mt-3 text-[11px] text-white/40">{t("sunTime.sunrise")}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl font-semibold tabular-nums">{formatHM(timeHours)}</span>
                <span className="mt-0.5 text-[11px] text-brand-400/90">{period}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm tabular-nums text-white/70">
                  {timeline.sunsetHour != null ? formatHM(timeline.sunsetHour) : "—"}
                </span>
                <span className="mt-3 text-[11px] text-white/40">{t("sunTime.sunset")}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Sun className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
              <div className="flex-1">{sliderTrack}</div>
              <Sun className="h-4 w-4 shrink-0 fill-brand-400/40 text-brand-400" aria-hidden="true" />
            </div>
            {!interactive && <p className="mt-2 text-[11px] text-white/35">{t("sunTime.readOnlyHint")}</p>}
          </div>

          <div className="flex shrink-0 flex-col gap-2 pt-1">
            <div className="flex gap-2">
              {dateMenu}
              {resetButton}
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">{presetRow}</div>
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
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel p-3.5 opacity-0",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 text-white">
          <span className="text-lg font-semibold tabular-nums">{formatHM(timeHours)}</span>
          <span className="text-xs text-white/50">· {dateLabel}</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {dateMenu}
          {resetButton}
        </div>
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
      <div className="mt-2.5">{presetRow}</div>
    </div>
  );
}
