"use client";

import { useMemo, useState } from "react";
import { Info, Landmark } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

function monthlyPayment(principal: number, annualRatePct: number, years: number) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function MortgageCalculator({
  initialPrice = 120000,
  compact = false,
}: {
  initialPrice?: number;
  compact?: boolean;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [downPct, setDownPct] = useState(20);
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(4.2);
  const { t } = useT();

  const downPayment = Math.round((price * downPct) / 100);
  const principal = price - downPayment;
  const monthly = useMemo(
    () => monthlyPayment(principal, rate, years),
    [principal, rate, years]
  );

  return (
    <div className={compact ? "" : "rounded-panel border border-neutral-200 bg-white p-5"}>
      <div className={cn("flex items-center gap-2", compact ? "mb-2.5" : "mb-4")}>
        <Landmark className="h-4.5 w-4.5 text-brand-500" />
        <h3 className="text-sm font-bold text-neutral-900">{t("mortgage.title")}</h3>
      </div>

      <div className={compact ? "space-y-2.5" : "space-y-4"}>
        <Field label={t("mortgage.propertyPrice")} compact={compact}>
          <NumberInput value={price} onChange={setPrice} suffix="€" step={1000} min={0} compact={compact} />
        </Field>

        <Field
          label={t("mortgage.downPayment", {
            pct: downPct,
            amount: formatPrice(downPayment, "EUR"),
          })}
          compact={compact}
        >
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={downPct}
            onChange={(e) => setDownPct(Number(e.target.value))}
            className="w-full accent-brand-500"
            aria-label={t("mortgage.downPaymentAria")}
          />
        </Field>

        <div className={cn("grid grid-cols-2", compact ? "gap-2" : "gap-3")}>
          <Field label={t("mortgage.loanTerm")} compact={compact}>
            <NumberInput value={years} onChange={setYears} min={5} max={35} step={1} compact={compact} />
          </Field>
          <Field label={t("mortgage.interestRate")} compact={compact}>
            <NumberInput value={rate} onChange={setRate} min={0} max={15} step={0.1} compact={compact} />
          </Field>
        </div>
      </div>

      <div className={cn("rounded-card bg-brand-50", compact ? "mt-3 p-3" : "mt-5 p-4")}>
        <p className="text-xs font-medium text-brand-700">{t("mortgage.estimatedMonthly")}</p>
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
        {t("mortgage.disclaimer")}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className={cn("block text-xs font-medium text-neutral-500", compact ? "mb-1" : "mb-1.5")}>
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-control border border-neutral-200",
        compact ? "px-2.5 py-1.5" : "px-3 py-2"
      )}
    >
      {suffix && <span className="text-sm text-neutral-400">{suffix}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-transparent text-sm text-neutral-800 focus:outline-none"
      />
    </div>
  );
}
