"use client";

import { useT } from "@/lib/i18n/useT";
import { DonutChart, DonutLegend, HorizontalBarChart } from "./charts";
import { useSection, DashboardCard } from "./dashboardKit";

interface InventoryPayload {
  units: { available: number; reserved: number; sold: number };
  priceIntelligence: { belowAverage: number; atAverage: number; aboveAverage: number; overallAvgPricePerSqm: number | null; sampleSize: number };
}
interface PublisherHealth {
  total: number;
  verified: number;
  pendingVerification: number;
  suspended: number;
}
interface TopLocations {
  items: { city: string; count: number }[];
}

const INVENTORY_COLORS = { available: "var(--color-success)", reserved: "#ca8a04", sold: "var(--color-brand-500)" };

/**
 * Analytics — deliberately modest (PRD §1.2 non-goal: "not a
 * business-intelligence warehouse; surfaces operational metrics and links
 * to deeper analytics"). Re-presents the same real endpoints the Dashboard
 * cards already use (Inventory, Price Intelligence, Publisher Health,
 * Top Locations) at a larger size rather than building a second, parallel
 * set of metrics — no data here is different from what the Dashboard
 * already shows, just roomier. Each card fetches via `useSection` so a
 * failed request shows the shared honest "unavailable, retry" state
 * instead of a silently blank card.
 */
export function AdminAnalyticsTab() {
  const { t } = useT();
  const inventory = useSection<InventoryPayload>("/api/admin/dashboard/inventory");
  const publishers = useSection<PublisherHealth>("/api/admin/dashboard/publishers");
  const locations = useSection<TopLocations>("/api/admin/dashboard/top-locations");

  const unitTotal = inventory.data ? inventory.data.units.available + inventory.data.units.reserved + inventory.data.units.sold : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.tabAnalytics")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.analytics.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardCard
          title={t("admin.dashboard.inventoryTitle")}
          loading={inventory.loading}
          error={inventory.error}
          onRetry={inventory.reload}
        >
          {inventory.data && (
            <div className="flex items-center gap-6">
              <DonutChart
                size={140}
                centerValue={unitTotal.toLocaleString()}
                centerLabel={t("admin.analytics.totalUnits")}
                segments={[
                  { label: t("admin.dashboard.inventoryAvailable"), value: inventory.data.units.available, color: INVENTORY_COLORS.available },
                  { label: t("admin.dashboard.inventoryReserved"), value: inventory.data.units.reserved, color: INVENTORY_COLORS.reserved },
                  { label: t("admin.dashboard.inventorySold"), value: inventory.data.units.sold, color: INVENTORY_COLORS.sold },
                ]}
              />
              <div className="flex-1">
                <DonutLegend
                  total={unitTotal}
                  segments={[
                    { label: t("admin.dashboard.inventoryAvailable"), value: inventory.data.units.available, color: INVENTORY_COLORS.available },
                    { label: t("admin.dashboard.inventoryReserved"), value: inventory.data.units.reserved, color: INVENTORY_COLORS.reserved },
                    { label: t("admin.dashboard.inventorySold"), value: inventory.data.units.sold, color: INVENTORY_COLORS.sold },
                  ]}
                />
              </div>
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title={t("admin.analytics.topLocationsTitle")}
          loading={locations.loading}
          error={locations.error}
          onRetry={locations.reload}
        >
          {locations.data && locations.data.items.length > 0 ? (
            <HorizontalBarChart data={locations.data.items.map((l) => ({ label: l.city, value: l.count }))} />
          ) : (
            <p className="py-6 text-center text-xs text-neutral-400">{t("admin.dashboard.priceNoSample")}</p>
          )}
          <p className="mt-3 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400">{t("admin.analytics.topLocationsNote")}</p>
        </DashboardCard>

        <DashboardCard
          title={t("admin.dashboard.priceIntelligenceTitle")}
          loading={inventory.loading}
          error={inventory.error}
          onRetry={inventory.reload}
        >
          {inventory.data &&
            (inventory.data.priceIntelligence.sampleSize === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-400">{t("admin.dashboard.priceNoSample")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-serif text-2xl text-neutral-900">{inventory.data.priceIntelligence.belowAverage}</p>
                  <p className="text-xs text-neutral-500">{t("admin.dashboard.priceBelowAvg")}</p>
                </div>
                <div>
                  <p className="font-serif text-2xl text-neutral-900">{inventory.data.priceIntelligence.atAverage}</p>
                  <p className="text-xs text-neutral-500">{t("admin.dashboard.priceAtAvg")}</p>
                </div>
                <div>
                  <p className="font-serif text-2xl text-neutral-900">{inventory.data.priceIntelligence.aboveAverage}</p>
                  <p className="text-xs text-neutral-500">{t("admin.dashboard.priceAboveAvg")}</p>
                </div>
              </div>
            ))}
        </DashboardCard>

        <DashboardCard
          title={t("admin.dashboard.publisherHealthTitle")}
          loading={publishers.loading}
          error={publishers.error}
          onRetry={publishers.reload}
        >
          {publishers.data && (
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              <div>
                <p className="font-serif text-2xl text-neutral-900">{publishers.data.total}</p>
                <p className="text-xs text-neutral-500">{t("admin.dashboard.publisherTotal")}</p>
              </div>
              <div>
                <p className="font-serif text-2xl text-success">{publishers.data.verified}</p>
                <p className="text-xs text-neutral-500">{t("admin.dashboard.publisherVerified")}</p>
              </div>
              <div>
                <p className="font-serif text-2xl text-warning">{publishers.data.pendingVerification}</p>
                <p className="text-xs text-neutral-500">{t("admin.dashboard.publisherPending")}</p>
              </div>
              <div>
                <p className="font-serif text-2xl text-danger">{publishers.data.suspended}</p>
                <p className="text-xs text-neutral-500">{t("admin.dashboard.publisherSuspended")}</p>
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
