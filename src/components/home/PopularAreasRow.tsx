"use client";

import { neighborhoods } from "@/lib/mockData";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";

export function PopularAreasRow() {
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);
  const setFilters = useAppStore((s) => s.setFilters);
  const { t } = useT();

  return (
    <div className="px-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{t("home.popularAreasTitle")}</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto scroll-thin pb-1">
        {neighborhoods.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              setFilters({ location: n.name });
              requestFlyTo({ lat: n.coords.lat, lng: n.coords.lng, zoom: 15 });
            }}
            className="flex shrink-0 items-center gap-2.5 rounded-pill border border-neutral-200 bg-white py-1.5 pl-1.5 pr-3.5"
          >
            <PlaceholderImage
              seed={n.id}
              kind="facade"
              className="h-9 w-9 rounded-xl"
              iconClassName="h-4 w-4"
            />
            <span className="text-left">
              <span className="block text-xs font-semibold text-neutral-800">{n.name}</span>
              <span className="block text-[11px] text-neutral-500">
                {t("home.propertiesSuffix", { count: n.listingCount })}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
