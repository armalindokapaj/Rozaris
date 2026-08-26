"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Shared dark-theme Inspector field primitives — the "own dedicated
 * component set" this editor deliberately uses instead of the site-wide
 * Button/Dropdown primitives (Experience Editor v2 rebuild decision). */

/** How many discrete positions a `stops`-scaled slider's travel is cut
 * into. A piecewise slider's native `step` lives in POSITION space, not
 * value space, so this has to be fine enough that even the WIDEST segment
 * still resolves every multiple of `step` — otherwise the coarsest half
 * silently snaps to its own grid and a value the readout happily accepts
 * (60.90) becomes unreachable by dragging. Sized off the widest segment,
 * then shared equally by all of them, so the narrow segments come out
 * finer still. */
function positionStepCount(stops: number[], step: number): number {
  const segments = stops.length - 1;
  const widest = Math.max(...stops.slice(1).map((hi, i) => Math.abs(hi - stops[i])));
  return Math.max(segments, Math.ceil(widest / step) * segments);
}

/** Maps a value onto the slider's 0..1 travel across a piecewise-linear
 * scale. `stops` sit at EQUAL fractions of the track, so `[0, 100, 350]`
 * gives 0-100m the first half of the slider and 100-350m the second —
 * fine control where the values an admin actually types cluster, without
 * giving up reach at the top end. */
function valueToPosition(value: number, stops: number[]): number {
  const segments = stops.length - 1;
  if (value <= stops[0]) return 0;
  for (let i = 0; i < segments; i++) {
    const lo = stops[i];
    const hi = stops[i + 1];
    if (value <= hi) return (i + (hi === lo ? 0 : (value - lo) / (hi - lo))) / segments;
  }
  return 1;
}

function positionToValue(position: number, stops: number[], step: number): number {
  const segments = stops.length - 1;
  const scaled = Math.min(segments, Math.max(0, position * segments));
  // `segments - 1` so a position sitting exactly on the last stop reads
  // from the final segment rather than indexing one past the array.
  const i = Math.min(segments - 1, Math.floor(scaled));
  const raw = stops[i] + (scaled - i) * (stops[i + 1] - stops[i]);
  // toFixed(6) kills the float dust 0.1-stepped arithmetic leaves behind
  // (60.900000000000006), which would otherwise reach the readout.
  return Number((Math.round(raw / step) * step).toFixed(6));
}

/** Decimals the readout needs to tell two neighbouring steps apart. A
 * fixed 2dp rendered a 0.005-stepped slider as "0.01" for both 0.005 and
 * 0.010, so half its positions looked identical; floored at 2 so every
 * coarser slider keeps the readout it has always had. */
function stepDecimals(step: number): number {
  const fraction = String(step).split(".")[1] ?? "";
  return Math.max(2, fraction.length);
}

type SliderRowProps = {
  label: string;
  value: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  /** Turns the right-hand readout into a real typed number field — for
   * values an admin knows exactly (a slab height in metres, a rotation in
   * degrees) and shouldn't have to hunt for by dragging a slider whose
   * whole range is 550m wide. Opt-in so every other panel's readout stays
   * the plain, non-focusable label it has always been. */
  editable?: boolean;
  onChange: (v: number) => void;
} & (
  | { min: number; max: number; stops?: undefined }
  /** A non-linear scale instead of a flat min/max: the bounds ARE the
   * first and last stop, so passing both would be two sources of truth. */
  | { min?: undefined; max?: undefined; stops: number[] }
);

export function SliderRow(props: SliderRowProps) {
  const { label, value, step, suffix = "", disabled, editable = false, onChange, stops } = props;
  // `=== undefined` rather than a truthiness check: a `number[]` is always
  // truthy, so `props.stops ? ... : ...` would not narrow the union's
  // other branch and `props.min` would stay possibly-undefined.
  const min = props.stops === undefined ? props.min : props.stops[0];
  const positionSteps = stops ? positionStepCount(stops, step) : 0;
  const max = props.stops === undefined ? props.max : props.stops[props.stops.length - 1];
  const formatted = Number.isInteger(step) ? String(value) : value.toFixed(stepDecimals(step));
  return (
    <label className={cn("block", disabled && "opacity-40")}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-neutral-400">{label}</span>
        {editable ? (
          <NumberReadout
            value={value}
            formatted={formatted}
            min={min}
            max={max}
            suffix={suffix}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <span className="font-mono text-neutral-300">
            {formatted}
            {suffix}
          </span>
        )}
      </div>
      <input
        type="range"
        min={stops ? 0 : min}
        max={stops ? positionSteps : max}
        step={stops ? 1 : step}
        // A stored value outside the scale (an older record saved when the
        // bounds were wider) pins the handle at an end instead of throwing
        // it to the middle; the typed readout still shows the real number.
        value={stops ? Math.round(valueToPosition(value, stops) * positionSteps) : value}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            stops
              ? positionToValue(Number(e.target.value) / positionSteps, stops, step)
              : Number(e.target.value)
          )
        }
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500 disabled:cursor-not-allowed"
      />
    </label>
  );
}

/** The typed half of an `editable` SliderRow. Keeps the in-progress text
 * in local state while focused — committing on every keystroke would make
 * "-" or "1." (both legitimate mid-typing states, both `NaN` to
 * `Number()`) either snap the slider to the min or write NaN into the
 * draft. Commits on blur and on Enter, clamped to the slider's own
 * min/max so a typed value can never put the scene somewhere the slider
 * itself can't express; Escape abandons the edit. */
function NumberReadout({
  value,
  formatted,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  value: number;
  formatted: string;
  min: number;
  max: number;
  suffix: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(raw: string) {
    setDraft(null);
    // Comma decimals are what an Albanian-locale keyboard/keypad produces
    // ("42,5"), and this editor's own readouts render in that locale too —
    // so accept them rather than silently ignoring the edit.
    const parsed = Number(raw.trim().replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(parsed)) return; // keep the current value
    const clamped = Math.min(max, Math.max(min, parsed));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <span className="flex items-center gap-0.5 font-mono text-neutral-300">
      <input
        // Deliberately `text`, not `number`: a native number input renders
        // (and validates) its value in the BROWSER's locale, so on a
        // comma-decimal machine it shows "42,50" and reports an empty
        // string for anything it considers malformed — the edit vanishes
        // with no feedback. Text + an explicit parse keeps the readout
        // canonical ("42.50") and accepts either separator.
        type="text"
        inputMode="decimal"
        value={draft ?? formatted}
        disabled={disabled}
        // The row is a <label> wrapping the range input — without this a
        // click meant for the text field would be forwarded to the slider.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          } else if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-[11px] text-neutral-200 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed"
      />
      {suffix && <span className="text-neutral-500">{suffix}</span>}
    </span>
  );
}

export function ToggleRow({
  label,
  checked,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between py-1", disabled && "opacity-40")} title={hint}>
      <span className="text-[11px] text-neutral-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-4 w-8 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
          checked ? "bg-indigo-500" : "bg-neutral-700"
        )}
      >
        <span
          className={cn(
            // Real bug this fixes (live-caught via DOM measurement, not
            // just a screenshot glance): the button has no `flex` reset
            // of its own, but this project's global button styles do —
            // an absolutely positioned child with no `left`/`right` set
            // resolves its static position via the parent's flex
            // alignment, not flush to the left edge, so the old
            // `translate-x-0.5`/`translate-x-4` pair (tuned assuming a
            // left:0 rest position) left "off" already near the right
            // edge and pushed "on" half outside the pill. Anchoring the
            // knob to `left-0.5` explicitly makes both states resolve
            // exactly where their translate values intend.
            "absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

export function ColorRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={cn("flex items-center justify-between py-1", disabled && "opacity-40")}>
      <span className="text-[11px] text-neutral-300">{label}</span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-8 cursor-pointer rounded border border-neutral-700 bg-transparent disabled:cursor-not-allowed"
      />
    </div>
  );
}

export function SelectRow<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <label className={cn("flex items-center justify-between py-1", disabled && "opacity-40")}>
      <span className="text-[11px] text-neutral-300">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-200 disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide text-neutral-500 first:mt-0">{children}</p>;
}

export function GroupCard({ children }: { children: React.ReactNode }) {
  return <div className="space-y-0.5 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">{children}</div>;
}
