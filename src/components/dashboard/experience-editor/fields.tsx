"use client";

import { cn } from "@/lib/utils";

/** Shared dark-theme Inspector field primitives — the "own dedicated
 * component set" this editor deliberately uses instead of the site-wide
 * Button/Dropdown primitives (Experience Editor v2 rebuild decision). */

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={cn("block", disabled && "opacity-40")}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-neutral-400">{label}</span>
        <span className="font-mono text-neutral-300">
          {Number.isInteger(step) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500 disabled:cursor-not-allowed"
      />
    </label>
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
