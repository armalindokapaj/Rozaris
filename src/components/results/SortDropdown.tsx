"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { SORT_LABELS } from "@/lib/constants";
import type { SortOption } from "@/lib/types";

const OPTIONS: SortOption[] = [
  "recommended",
  "premium",
  "newest",
  "price_asc",
  "price_desc",
  "area_desc",
  "area_asc",
  "distance",
];

export function SortDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sort = useAppStore((s) => s.filters.sort);
  const setFilters = useAppStore((s) => s.setFilters);
  const { t, locale } = useT();
  const sortLabels = SORT_LABELS[locale];
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative min-w-0 max-w-full" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 max-w-full items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-900"
      >
        <span className="shrink-0">{t("results.sortByPrefix")}</span>
        <span className="truncate text-neutral-900">{sortLabels[sort]}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-1/2 z-30 mt-2 w-48 max-w-[90vw] -translate-x-1/2 rounded-card border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)]"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              role="option"
              aria-selected={sort === opt}
              onClick={() => {
                setFilters({ sort: opt });
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {sortLabels[opt]}
              {sort === opt && <Check className="h-3.5 w-3.5 text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
