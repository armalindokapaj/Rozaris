"use client";

import { useAppStore } from "@/lib/store";
import { FiltersForm } from "./FiltersForm";

export function FiltersPanel() {
  const setSavedSearchModal = useAppStore((s) => s.addSavedSearch);
  const filters = useAppStore((s) => s.filters);
  const auth = useAppStore((s) => s.auth);

  function saveSearch() {
    if (!auth.signedIn) return;
    setSavedSearchModal({
      id: `search-${Date.now()}`,
      name: `${filters.location} · ${filters.transaction === "buy" ? "Buy" : "Rent"}`,
      filtersSummary: [
        filters.propertyTypes.join(", ") || "Any type",
        filters.priceMax ? `Up to €${filters.priceMax.toLocaleString()}` : null,
        filters.bedrooms ? `${filters.bedrooms}+ bed` : null,
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
        <h1 className="text-[17px] font-bold text-neutral-900">
          Find Your Perfect Property
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        <FiltersForm />
      </div>
      <div className="shrink-0 space-y-2 border-t border-neutral-100 p-4">
        <button
          onClick={saveSearch}
          disabled={!auth.signedIn}
          className="w-full rounded-control bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          title={auth.signedIn ? undefined : "Sign in to save searches"}
        >
          Save this search
        </button>
      </div>
    </div>
  );
}
