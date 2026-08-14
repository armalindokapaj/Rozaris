"use client";

import { ChevronDown } from "lucide-react";
import { useDropdown } from "@/hooks/useDropdown";
import { DropdownPanel } from "@/components/ui/Dropdown";
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
  const { open, toggle, close, ref } = useDropdown<HTMLDivElement>();

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-control border border-neutral-300 bg-white px-3 text-sm font-semibold transition-colors",
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
        <DropdownPanel align={align} width="w-full" className={panelClassName}>
          {children(close)}
        </DropdownPanel>
      )}
    </div>
  );
}
