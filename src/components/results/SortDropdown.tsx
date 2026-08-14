"use client";

import { ChevronDown } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useDropdown } from "@/hooks/useDropdown";
import { DropdownPanel, DropdownMenuItem } from "@/components/ui/Dropdown";
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
  const { open, toggle, close, ref } = useDropdown<HTMLDivElement>();
  const sort = useAppStore((s) => s.filters.sort);
  const setFilters = useAppStore((s) => s.setFilters);
  const { t, locale } = useT();
  const sortLabels = SORT_LABELS[locale];

  return (
    <div className="relative min-w-0 max-w-full" ref={ref}>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full min-w-0 max-w-full items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 hover:text-neutral-900"
      >
        <span className="shrink-0">{t("results.sortByPrefix")}</span>
        <span className="truncate text-neutral-900">{sortLabels[sort]}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <DropdownPanel align="left" width="w-48 max-w-[90vw]" role="listbox" className="left-1/2 -translate-x-1/2">
          {OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt}
              role="option"
              selected={sort === opt}
              onClick={() => {
                setFilters({ sort: opt });
                close();
              }}
            >
              {sortLabels[opt]}
            </DropdownMenuItem>
          ))}
        </DropdownPanel>
      )}
    </div>
  );
}
