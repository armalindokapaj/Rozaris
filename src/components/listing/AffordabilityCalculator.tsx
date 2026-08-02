"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, Users } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

// Estimated monthly cost of living for one person, excluding rent/mortgage.
const MIN_LIVING_PER_PERSON = 570;

type Risk = "low" | "medium" | "high";

function riskFor(remainingAfterAll: number, monthlyPayment: number, income: number): Risk {
  if (income <= 0) return "high";
  if (remainingAfterAll < 0) return "high";
  if (remainingAfterAll < income * 0.15 || monthlyPayment > income * 0.35) return "medium";
  return "low";
}

const RISK_STYLE: Record<Risk, { icon: typeof CheckCircle2; classes: string }> = {
  low: { icon: CheckCircle2, classes: "bg-green-50 text-green-700 border-green-200" },
  medium: { icon: AlertTriangle, classes: "bg-amber-50 text-amber-700 border-amber-200" },
  high: { icon: ShieldAlert, classes: "bg-red-50 text-red-700 border-red-200" },
};

export function AffordabilityCalculator({ monthlyPayment }: { monthlyPayment: number }) {
  const [familyMembers, setFamilyMembers] = useState(1);
  const [income, setIncome] = useState(1200);
  const { t } = useT();

  const minLivingCost = familyMembers * MIN_LIVING_PER_PERSON;
  const remainingAfterAll = useMemo(
    () => income - minLivingCost - monthlyPayment,
    [income, minLivingCost, monthlyPayment]
  );
  const risk = riskFor(remainingAfterAll, monthlyPayment, income);
  const RiskIcon = RISK_STYLE[risk].icon;

  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4.5 w-4.5 text-brand-500" />
        <h3 className="text-sm font-bold text-neutral-900">{t("mortgage.affordabilityTitle")}</h3>
      </div>
      <p className="mb-4 text-xs text-neutral-500">{t("mortgage.affordabilitySubtitle")}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">
            {t("mortgage.familyMembersLabel")}
          </span>
          <input
            type="number"
            min={1}
            max={12}
            value={familyMembers}
            onChange={(e) => setFamilyMembers(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-control border border-neutral-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-neutral-500">
            {t("mortgage.monthlyIncomeLabel")}
          </span>
          <div className="flex items-center gap-2 rounded-control border border-neutral-200 px-3 py-2">
            <span className="text-sm text-neutral-400">€</span>
            <input
              type="number"
              min={0}
              step={50}
              value={income}
              onChange={(e) => setIncome(Number(e.target.value))}
              className="w-full bg-transparent text-sm text-neutral-800 focus:outline-none"
            />
          </div>
        </label>
      </div>

      <div className="mt-4 space-y-2 rounded-card bg-neutral-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">
            {t("mortgage.minLivingCostLabel", { amount: formatPrice(MIN_LIVING_PER_PERSON, "EUR") })}
          </span>
          <span className="font-semibold tabular-nums text-neutral-800">
            {formatPrice(minLivingCost, "EUR")}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">{t("mortgage.mortgagePaymentLabel")}</span>
          <span className="font-semibold tabular-nums text-neutral-800">
            {formatPrice(Math.round(monthlyPayment), "EUR")}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
          <span className="font-medium text-neutral-700">{t("mortgage.remainingAfterAllLabel")}</span>
          <span
            className={cn(
              "font-bold tabular-nums",
              remainingAfterAll < 0 ? "text-red-600" : "text-neutral-900"
            )}
          >
            {formatPrice(Math.round(remainingAfterAll), "EUR")}
          </span>
        </div>
      </div>

      <div className={cn("mt-4 flex items-start gap-2.5 rounded-card border p-3.5", RISK_STYLE[risk].classes)}>
        <RiskIcon className="mt-0.5 h-4.5 w-4.5 shrink-0" />
        <div>
          <p className="text-sm font-bold">
            {t("mortgage.riskLabel")}: {t(`mortgage.risk${risk[0].toUpperCase()}${risk.slice(1)}`)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed">
            {t(`mortgage.risk${risk[0].toUpperCase()}${risk.slice(1)}Desc`)}
          </p>
        </div>
      </div>
    </div>
  );
}
