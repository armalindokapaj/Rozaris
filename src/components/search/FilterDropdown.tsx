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
  className,
  align = "left",
  children,
}: {
  label: React.ReactNode;
  /** Highlights the pill to show a non-default value is set. */
  active?: boolean;
  panelClassName?: string;
  className?: string;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-none border border-neutral-300 bg-white px-3 text-sm font-semibold transition-colors",
          active || open
            ? "border-neutral-800 text-neutral-900 shadow-[var(--shadow-1)]"
            : "text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
        )}
      >
        {label}
        {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />}
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+2px)] z-40 w-72 max-w-[calc(100vw-2rem)] rounded-none border border-neutral-300 bg-white p-3.5 shadow-[0_3px_9px_rgba(17,24,39,0.24)]",
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
