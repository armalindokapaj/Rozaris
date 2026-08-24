"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the Project Manager (`/admin/projects/[projectId]`) —
 * the console's ERP-style record view. Every section is built out of these
 * four pieces so twelve independently-authored panels still read as one
 * application rather than twelve visual dialects. Deliberately plain
 * Tailwind, not the public site's shared `<Button>`: that component's own
 * doc comment scopes it to the marketing site, and admin keeps its own
 * hand-rolled chrome (same as Distribution, Map Control and the 3D
 * editors).
 */

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-neutral-900">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-panel border border-neutral-200 bg-white", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-100 px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>}
            {description && <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-neutral-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** One labelled form control. `hint` sits under the field for the "why is
 * this read-only" / "this changes the public URL" notes an ERP record view
 * lives on. */
export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-neutral-400">{hint}</span>}
    </label>
  );
}

/** The control WITHOUT a width — for inline cases (a filter select in a
 * toolbar, a 20-wide number input beside a slider). Composing
 * `${inputClass} w-auto` silently loses instead: two same-specificity
 * width utilities resolve by stylesheet order, not by their order in the
 * class string, so `w-full` kept winning and every toolbar select
 * rendered full-bleed. */
export const narrowInputClass =
  "rounded-control border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-brand-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500";

/** The full-width control used by every stacked form field. */
export const inputClass = `w-full ${narrowInputClass}`;

export const readOnlyInputClass =
  "w-full cursor-not-allowed rounded-control border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 focus:outline-none";

export function Btn({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-control px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-neutral-900 text-white hover:bg-neutral-800",
        variant === "secondary" && "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
        variant === "danger" && "border border-danger/30 bg-white text-danger hover:bg-danger/5",
        variant === "ghost" && "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
        className
      )}
    />
  );
}

/** A single figure with its label — the Overview section's whole
 * vocabulary. `tone` colours only the value, never the whole tile: a wall
 * of coloured boxes stops meaning anything. */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  return (
    <div className="rounded-card border border-neutral-200 bg-white p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "neutral" && "text-neutral-900",
          tone === "positive" && "text-emerald-600",
          tone === "warning" && "text-amber-600",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "neutral" && "bg-neutral-100 text-neutral-600",
        tone === "positive" && "bg-emerald-50 text-emerald-700",
        tone === "warning" && "bg-amber-50 text-amber-700",
        tone === "danger" && "bg-red-50 text-red-700",
        tone === "info" && "bg-brand-50 text-brand-700"
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-dashed border-neutral-200 px-4 py-8 text-center text-xs text-neutral-400">
      {children}
    </p>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-control border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{children}</p>
  );
}

/** Add/remove list editor for the two `String[]` columns a project carries
 * (buildings, amenities). Beats the comma-separated single input the old
 * modal used, where deleting one entry meant re-typing the whole line and
 * a stray comma silently created an empty building called "". */
export function ChipEditor({
  values,
  onChange,
  placeholder,
  addLabel,
  emptyLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="text-xs text-neutral-400">{emptyLabel}</span>}
        {values.map((value, i) => (
          <span
            key={`${value}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-1 pl-3 pr-1 text-xs font-medium text-neutral-700"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, index) => index !== i))}
              aria-label={`Remove ${value}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("value") as HTMLInputElement;
          const next = input.value.trim();
          // Silently ignoring a duplicate beats adding a second "Pool"
          // chip that then has to be hunted down.
          if (next && !values.includes(next)) onChange([...values, next]);
          input.value = "";
        }}
        className="flex gap-1.5"
      >
        <input name="value" placeholder={placeholder} className={inputClass} />
        <Btn type="submit" variant="secondary" className="shrink-0">
          {addLabel}
        </Btn>
      </form>
    </div>
  );
}
