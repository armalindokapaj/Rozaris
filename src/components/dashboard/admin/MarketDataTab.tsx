"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { formatRelativeDate } from "@/lib/utils";

interface MarketRow {
  locationId: string | null;
  locationName: string;
  saleAvgPerSqm: number | null;
  saleCount: number;
  rentAvgPerSqm: number | null;
  rentCount: number;
  twelveMonthChangePercent: number | null;
}

interface TransactionRow {
  id: string;
  type: string;
  price: number | null;
  currency: string;
  occurredAt: string;
  excludedFromStats: boolean;
  excludedReason: string | null;
  listingTitle: string;
  listingSlug: string;
  area: number | null;
  location: string | null;
}

/**
 * Market Data Engine (PRD_ROZARIS_Admin §12) — real €/m² by location,
 * computed server-side from completed `Transaction` rows
 * (`GET /api/admin/market-data`), plus the raw transaction list an admin
 * can exclude an outlier from (`GET/PATCH /api/admin/transactions`).
 */
export function MarketDataTab() {
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [showTxns, setShowTxns] = useState(false);
  const [loading, setLoading] = useState(true);

  function refresh() {
    Promise.all([
      fetch("/api/admin/market-data").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/admin/transactions").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([market, transactions]) => {
        setRows(market);
        setTxns(transactions);
      })
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function toggleExclude(txn: TransactionRow) {
    const excluding = !txn.excludedFromStats;
    const reason = excluding ? window.prompt(t("admin.marketData.excludeReasonPrompt")) : null;
    if (excluding && !reason?.trim()) return;
    await fetch("/api/admin/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: txn.id, excludedFromStats: excluding, excludedReason: reason ?? undefined }),
    });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-neutral-900">{t("admin.marketData.title")}</h1>
        <p className="text-sm text-neutral-500">{t("admin.marketData.subtitle")}</p>
      </div>

      <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colLocation")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colSalePerSqm")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colRentPerSqm")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colChange")}</th>
              <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colUsed")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.locationId ?? r.locationName}>
                <td className="px-4 py-3 font-medium text-neutral-800">{r.locationName}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-600">
                  {r.saleAvgPerSqm != null ? priceFmt(r.saleAvgPerSqm) + "/m²" : t("admin.marketData.noData")}
                </td>
                <td className="px-4 py-3 tabular-nums text-neutral-600">
                  {r.rentAvgPerSqm != null ? priceFmt(r.rentAvgPerSqm) + "/m²" : t("admin.marketData.noData")}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {r.twelveMonthChangePercent == null ? (
                    <span className="text-neutral-400">{t("admin.marketData.noData")}</span>
                  ) : (
                    <span className={`flex items-center gap-1 font-semibold ${r.twelveMonthChangePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {r.twelveMonthChangePercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {r.twelveMonthChangePercent.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{t("admin.marketData.usedCount", { sale: r.saleCount, rent: r.rentCount })}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-400">
                  {t("admin.marketData.emptyState")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button onClick={() => setShowTxns((v) => !v)} className="text-xs font-semibold text-brand-600 hover:underline">
        {showTxns ? t("common.close") : t("admin.marketData.viewTransactions")}
      </button>

      {showTxns && (
        <div className="overflow-hidden rounded-panel border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("dashboard.titleLabel")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colLocation")}</th>
                <th className="px-4 py-2.5 font-medium">{t("dashboard.priceLabel")}</th>
                <th className="px-4 py-2.5 font-medium">{t("admin.marketData.colDate")}</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {txns.map((tx) => (
                <tr key={tx.id} className={tx.excludedFromStats ? "opacity-50" : undefined}>
                  <td className="px-4 py-3 font-medium text-neutral-800">{tx.listingTitle}</td>
                  <td className="px-4 py-3 text-neutral-600">{tx.location ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-neutral-600">{tx.price != null ? priceFmt(tx.price) : "—"}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatRelativeDate(tx.occurredAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleExclude(tx)} className="text-xs font-semibold text-brand-600 hover:underline">
                      {tx.excludedFromStats ? t("admin.marketData.reinclude") : t("admin.marketData.exclude")}
                    </button>
                  </td>
                </tr>
              ))}
              {txns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-400">
                    {t("admin.marketData.emptyState")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
