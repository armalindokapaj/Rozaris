"use client";

import { useMemo, useState } from "react";
import { Info, ShieldCheck } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

type Coverage = "basic" | "comprehensive";

const ANNUAL_RATE: Record<Coverage, number> = {
  basic: 0.0025,
  comprehensive: 0.0045,
};

export function InsuranceCalculator({
  initialPrice = 120000,
  compact = false,
}: {
  initialPrice?: number;
  compact?: boolean;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [coverage, setCoverage] = useState<Coverage>("basic");
  const { t } = useT();

  const monthly = useMemo(() => (price * ANNUAL_RATE[coverage]) / 12, [price, coverage]);

  return (
    <div className={compact ? "" : "rounded-panel border border-neutral-200 bg-white p-5"}>
      <div className={cn("flex items-center gap-2", compact ? "mb-2.5" : "mb-4")}>
        <ShieldCheck className="h-4.5 w-4.5 text-brand-500" />
        <h3 className="text-sm font-bold text-neutral-900">{t("insurance.title")}</h3>
      </div>

      <div className={compact ? "space-y-2.5" : "space-y-4"}>
        <label className="block">
          <span className={cn("block text-xs font-medium text-neutral-500", compact ? "mb-1" : "mb-1.5")}>
            {t("mortgage.propertyPrice")}
          </span>
          <div
            className={cn(
              "flex items-center gap-2 rounded-control border border-neutral-200",
              compact ? "px-2.5 py-1.5" : "px-3 py-2"
            )}
          >
            <span className="text-sm text-neutral-400">€</span>
            <input
              type="number"
              value={price}
              min={0}
              step={1000}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full bg-transparent text-sm text-neutral-800 focus:outline-none"
            />
          </div>
        </label>

        <div>
          <span className={cn("block text-xs font-medium text-neutral-500", compact ? "mb-1" : "mb-1.5")}>
            {t("insurance.coverageLevel")}
          </span>
          <div className={cn("grid grid-cols-2", compact ? "gap-1.5" : "gap-2")}>
            {(["basic", "comprehensive"] as Coverage[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setCoverage(level)}
                aria-pressed={coverage === level}
                className={cn(
                  "rounded-control border text-sm font-medium transition-colors",
                  compact ? "px-2.5 py-1.5" : "px-3 py-2",
                  coverage === level
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                )}
              >
                {level === "basic" ? t("insurance.coverageBasic") : t("insurance.coverageComprehensive")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cn("rounded-card bg-brand-50", compact ? "mt-3 p-3" : "mt-5 p-4")}>
        <p className="text-xs font-medium text-brand-700">{t("insurance.estimatedMonthly")}</p>
        <p className={cn("font-bold text-brand-800", compact ? "mt-0.5 text-xl" : "mt-1 text-2xl")}>
          {formatPrice(Math.round(monthly), "EUR")}
          <span className="text-sm font-medium text-brand-600">{t("results.perMonth")}</span>
        </p>
      </div>

      <p
        className={cn(
          "flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-400",
          compact ? "mt-2" : "mt-3"
        )}
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("insurance.disclaimer")}
      </p>
    </div>
  );
}
