import { ChevronUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Unit } from "@/lib/types";

/** Shared bottom-bar UI pieces for ProceduralProjectViewer — the
 * Home/Search/Sun/Palette icon row and expanding dark glass panels. */

/** A single "LABEL / ALL ⌃" control in the bottom filter bar. */
export function DarkSelect({
  label,
  value,
  onChange,
  options,
  dotColor,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  /** Tints the pill to match the currently selected availability status. */
  dotColor?: number;
  /** Skip the internal caption when the caller already renders its own
   * section label above (e.g. the scene-controls panel's Season column). */
  hideLabel?: boolean;
}) {
  return (
    <label className="block min-w-[6.5rem] flex-1 sm:flex-none">
      {!hideLabel && (
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-white/50">
          {label}
        </span>
      )}
      <span className="relative block">
        {dotColor != null && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
            style={{ background: `#${dotColor.toString(16).padStart(6, "0")}` }}
          />
        )}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-control border border-white/15 bg-white/10 py-2 pr-8 text-xs font-semibold uppercase text-white focus:border-white/40 focus:outline-none",
            dotColor != null ? "pl-7" : "pl-3"
          )}
        >
          {options.map(([v, l]) => (
            <option key={v} value={v} className="text-neutral-900">
              {l}
            </option>
          ))}
        </select>
        <ChevronUp className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
      </span>
    </label>
  );
}

/** "h:mm AM/PM" display for the Sun Orientation slider's hour value
 * (2026-08-14, 2nd pass) — re-added verbatim from the old Time of Day
 * scrubber this replaced (same name/signature), which read this file
 * before being removed the same day as the Sky/Ocean tab work. */
export function formatHour(h: number): string {
  const hour24 = Math.floor(h);
  const minutes = Math.round((h - hour24) * 60);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** Auto-generated key of colored dot + label pills for whatever unit
 * statuses are actually present among currently-visible units (PRD §58) —
 * a status with zero visible units today just doesn't render a pill,
 * rather than always showing all three. */
export function StatusLegend({
  statuses,
  colors,
  labels,
  className,
}: {
  statuses: Unit["status"][];
  colors: Record<Unit["status"], number>;
  labels: Record<Unit["status"], string>;
  className?: string;
}) {
  if (statuses.length === 0) return null;
  return (
    <div className={cn("glass-panel-dark flex items-center gap-3 rounded-pill px-3.5 py-2", className)}>
      {statuses.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: `#${colors[s].toString(16).padStart(6, "0")}` }}
          />
          {labels[s]}
        </span>
      ))}
    </div>
  );
}

/** A single bottom-menu icon — no visible label by default; a small
 * tooltip fades in above it on hover/focus, per the reference design
 * ("Main Menu at the bottom is only with Icons, when the mouse hovers then
 * it shows what Menu it is"). */
export function MenuIconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Icon className="h-4.5 w-4.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-control bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white opacity-0 shadow-[var(--shadow-2)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
