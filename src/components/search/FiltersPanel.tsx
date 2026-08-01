"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { FiltersForm } from "./FiltersForm";

export function FiltersPanel() {
  const setSavedSearchModal = useAppStore((s) => s.addSavedSearch);
  const filters = useAppStore((s) => s.filters);
  const auth = useAppStore((s) => s.auth);
  const { t } = useT();

  function saveSearch() {
    if (!auth.signedIn) return;
    setSavedSearchModal({
      id: `search-${Date.now()}`,
      name: `${filters.location} · ${filters.transaction === "buy" ? t("nav.buy") : t("nav.rent")}`,
      filtersSummary: [
        filters.propertyTypes.join(", ") || t("filters.anyType"),
        filters.priceMax ? t("filters.upToAmount", { amount: `€${filters.priceMax.toLocaleString()}` }) : null,
        filters.bedrooms ? t("filters.bedPlus", { count: filters.bedrooms }) : null,
      ]
        .filter(Boolean)
        .join(" · "),
      cadence: "daily",
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <div className="glass-panel flex h-full flex-col overflow-hidden rounded-panel shadow-sm">
      <div className="shrink-0 border-b border-neutral-100 px-5 pt-5 pb-4">
        <h1 className="text-[17px] font-bold text-neutral-900">{t("home.findPerfectProperty")}</h1>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        <FiltersForm />
      </div>
      {auth.signedIn && (
        <div className="shrink-0 space-y-2 border-t border-neutral-100 p-4">
          <button
            onClick={saveSearch}
            className="w-full rounded-control bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            {t("home.saveThisSearch")}
          </button>
        </div>
      )}
    </div>
  );
}
