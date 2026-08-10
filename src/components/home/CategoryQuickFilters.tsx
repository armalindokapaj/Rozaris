"use client";

import { Building2, Home as HomeIcon, LandPlot, MoreHorizontal, Store } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import type { PropertyType } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIES: { labelKey: string; icon: typeof Building2; types: PropertyType[] }[] = [
  { labelKey: "home.categoryApartments", icon: Building2, types: ["apartment", "studio"] },
  { labelKey: "home.categoryHouses", icon: HomeIcon, types: ["house", "villa"] },
  { labelKey: "home.categoryCommercial", icon: Store, types: ["commercial", "office"] },
  { labelKey: "home.categoryLand", icon: LandPlot, types: ["land"] },
];

function sameSet(a: PropertyType[], b: PropertyType[]) {
  return a.length === b.length && a.every((t) => b.includes(t));
}

export function CategoryQuickFilters({ onMore }: { onMore: () => void }) {
  const propertyTypes = useAppStore((s) => s.filters.propertyTypes);
  const setFilters = useAppStore((s) => s.setFilters);
  const { t } = useT();

  return (
    <div className="flex items-center gap-2 overflow-x-auto scroll-thin px-4 pb-1">
      {CATEGORIES.map(({ labelKey, icon: Icon, types }) => {
        const active = sameSet(propertyTypes, types);
        return (
          <button
            key={labelKey}
            onClick={() => setFilters({ propertyTypes: active ? [] : types })}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1.5 rounded-pill px-3.5 py-2",
              active ? "bg-brand-500 text-white" : "text-neutral-600"
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[11px] font-medium">{t(labelKey)}</span>
          </button>
        );
      })}
      <button
        onClick={onMore}
        className="flex shrink-0 flex-col items-center gap-1.5 rounded-pill px-3.5 py-2 text-neutral-600"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        <span className="text-[11px] font-medium">{t("home.more")}</span>
      </button>
    </div>
  );
}
