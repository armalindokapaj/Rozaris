"use client";

import { SearchX } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";

/** SEA-009: zero-result states must offer a concrete way forward. */
export function EmptyState() {
  const resetFilters = useAppStore((s) => s.resetFilters);
  const setFilters = useAppStore((s) => s.setFilters);
  const requestFlyTo = useAppStore((s) => s.requestFlyTo);
  const { t } = useT();

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
        <SearchX className="h-5 w-5 text-neutral-400" />
      </div>
      <p className="text-sm font-semibold text-neutral-800">{t("results.noPropertiesYet")}</p>
      <p className="max-w-xs text-sm text-neutral-500">{t("results.emptyStateBody")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          onClick={resetFilters}
          className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          {t("results.clearFilters")}
        </button>
        <button
          onClick={() => {
            requestFlyTo({ lat: 41.3275, lng: 19.8187, zoom: 12.4 });
          }}
          className="rounded-control border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          {t("results.widenMap")}
        </button>
        <button
          onClick={() => setFilters({ projectsOnly: true })}
          className="rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-600"
        >
          {t("results.viewComingSoon")}
        </button>
      </div>
    </div>
  );
}
