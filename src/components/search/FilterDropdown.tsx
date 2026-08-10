"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/utils";

/**
 * A single minimal pill in the top filter bar (Search page, FR desktop) —
 * collapsed by default, expanding into a popover panel only once clicked.
 * Only one of these is meant to be open at a time per bar; each instance
 * manages its own open state and closes on an outside click, so stacking
 * several in a row "just works" without a shared controller.
 */
export function FilterDropdown({
  label,
  active = false,
  panelClassName,
  align = "left",
  children,
}: {
  label: React.ReactNode;
  /** Highlights the pill to show a non-default value is set. */
  active?: boolean;
  panelClassName?: string;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1 whitespace-nowrap px-0 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
          active || open ? "text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
        )}
      >
        {label}
        {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />}
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+8px)] z-40 w-80 max-w-[min(90vw,22rem)] rounded-card border border-neutral-200 bg-white p-4 shadow-[var(--shadow-2)]",
            align === "right" ? "right-0" : "left-0",
            panelClassName
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
