import { AlertTriangle, Check } from "lucide-react";

/**
 * Shared field primitives for the Phase 2 editor shell's mode panels —
 * moved verbatim out of Project3DConfigEditor.tsx (which used to define
 * these at the bottom of the same 1684-line file) so every panel under
 * ./panels/ can import them without duplicating. No behavior change from
 * the originals.
 */

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brand-500"
      />
    </label>
  );
}

export function ColorField({
  label,
  value,
  placeholder = "#cccccc",
  onChange,
}: {
  label: string;
  /** `undefined` renders `placeholder` as the swatch color (an "unset,
   * uses the original" state) without writing an override until the admin
   * actually picks a color. */
  value: string | undefined;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-neutral-400">{value ?? placeholder}</span>
        <input
          type="color"
          value={value ?? placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-neutral-200 bg-transparent p-0"
        />
      </span>
    </label>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
        {label}
        <span className="font-semibold text-neutral-800">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
    </label>
  );
}

/** One row of the pre-publish checklist (Publish/runtime hardening pass)
 * — informational, doesn't itself gate anything; the real publish gate
 * stays server-side (422 on `validationStatus === "blocked"`, unchanged). */
export function ChecklistRow({ status, label }: { status: "ok" | "warn" | "info"; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === "ok" && <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />}
      {status === "warn" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
      {status === "info" && <span className="h-3.5 w-3.5 shrink-0" />}
      <span className="text-neutral-600">{label}</span>
    </div>
  );
}
