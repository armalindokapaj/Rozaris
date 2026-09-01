"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { gsap } from "gsap";
import { Moon, RotateCcw, Sun, Sunrise, Sunset, X } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { useEffectiveReducedMotion } from "@/hooks/useEffectiveReducedMotion";
import { clamp, cn } from "@/lib/utils";
import type { SunTimePreset, SunTimeline } from "@/lib/sunPosition";
import type { ActiveModule } from "../viewer-hud/types";

export function formatHM(hours: number): string {
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

  const fillPercent = clamp(((timeHours - bounds.startHours) / Math.max(1e-6, bounds.endHours - bounds.startHours)) * 100, 0, 100);
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
          "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 flex min-h-[104px] w-[632px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-panel px-3.5 py-2.5 opacity-0 ring-2 ring-brand-400/50 sm:px-4",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        {                                                          
                                 }
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

        {                                                               
                      }
        <div className="flex shrink-0 items-center pl-3.5 sm:pl-4">{presetGrid}</div>

        <span className="my-1 w-px shrink-0 bg-white/10" aria-hidden="true" />

        {                                                               
                    }
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
        "viewer-glass invisible absolute bottom-[calc(100%+12px)] left-1/2 w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-panel px-4 pb-4 pt-2.5 opacity-0",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {                                                                   
                                                           }
      <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden="true" />
      {                                                                    
                             }
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
      {                                                                   
                           }
      <div className="mt-2.5">{presetGrid}</div>
    </div>
  );
}
