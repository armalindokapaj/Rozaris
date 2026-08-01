"use client";

import { Building2, Home as HomeIcon, LandPlot, MoreHorizontal, Store } from "lucide-react";
import { useAppStore } from "@/lib/store";
import type { PropertyType } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIES: { label: string; icon: typeof Building2; types: PropertyType[] }[] = [
  { label: "Apartments", icon: Building2, types: ["apartment", "studio"] },
  { label: "Houses", icon: HomeIcon, types: ["house", "villa"] },
  { label: "Commercial", icon: Store, types: ["commercial", "office"] },
  { label: "Land", icon: LandPlot, types: ["land"] },
];

function sameSet(a: PropertyType[], b: PropertyType[]) {
  return a.length === b.length && a.every((t) => b.includes(t));
}

export function CategoryQuickFilters({ onMore }: { onMore: () => void }) {
  const propertyTypes = useAppStore((s) => s.filters.propertyTypes);
  const setFilters = useAppStore((s) => s.setFilters);

  return (
    <div className="flex items-center gap-2 overflow-x-auto scroll-thin px-4 pb-1">
      {CATEGORIES.map(({ label, icon: Icon, types }) => {
        const active = sameSet(propertyTypes, types);
        return (
          <button
            key={label}
            onClick={() => setFilters({ propertyTypes: active ? [] : types })}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3.5 py-2",
              active ? "bg-brand-500 text-white" : "text-neutral-600"
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        );
      })}
      <button
        onClick={onMore}
        className="flex shrink-0 flex-col items-center gap-1.5 rounded-2xl px-3.5 py-2 text-neutral-600"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        <span className="text-[11px] font-medium">More</span>
      </button>
    </div>
  );
}
