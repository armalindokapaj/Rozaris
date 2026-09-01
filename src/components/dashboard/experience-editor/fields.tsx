"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

function positionStepCount(stops: number[], step: number): number {
  const segments = stops.length - 1;
  const widest = Math.max(...stops.slice(1).map((hi, i) => Math.abs(hi - stops[i])));
  return Math.max(segments, Math.ceil(widest / step) * segments);
}

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
  const i = Math.min(segments - 1, Math.floor(scaled));
  const raw = stops[i] + (scaled - i) * (stops[i + 1] - stops[i]);
  return Number((Math.round(raw / step) * step).toFixed(6));
}

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
  editable?: boolean;
  onChange: (v: number) => void;
} & (
  | { min: number; max: number; stops?: undefined }
  | { min?: undefined; max?: undefined; stops: number[] }
);

export function SliderRow(props: SliderRowProps) {
  const { label, value, step, suffix = "", disabled, editable = false, onChange, stops } = props;
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
    const parsed = Number(raw.trim().replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;                          
    const clamped = Math.min(max, Math.max(min, parsed));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <span className="flex items-center gap-0.5 font-mono text-neutral-300">
      <input
        type="text"
        inputMode="decimal"
        value={draft ?? formatted}
        disabled={disabled}
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
