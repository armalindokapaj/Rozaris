"use client";

import { useMemo, useState } from "react";
import { Info, Landmark } from "lucide-react";
import { formatPrice } from "@/lib/utils";

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

  const downPayment = Math.round((price * downPct) / 100);
  const principal = price - downPayment;
  const monthly = useMemo(
    () => monthlyPayment(principal, rate, years),
    [principal, rate, years]
  );

  return (
    <div className={compact ? "" : "rounded-panel border border-neutral-200 bg-white p-5"}>
      <div className="mb-4 flex items-center gap-2">
        <Landmark className="h-4.5 w-4.5 text-brand-500" />
        <h3 className="text-sm font-bold text-neutral-900">Mortgage calculator</h3>
      </div>

      <div className="space-y-4">
        <Field label="Property price">
          <NumberInput value={price} onChange={setPrice} suffix="€" step={1000} min={0} />
        </Field>

        <Field label={`Down payment — ${downPct}% (${formatPrice(downPayment, "EUR")})`}>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={downPct}
            onChange={(e) => setDownPct(Number(e.target.value))}
            className="w-full accent-brand-500"
            aria-label="Down payment percentage"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Loan term (years)">
            <NumberInput value={years} onChange={setYears} min={5} max={35} step={1} />
          </Field>
          <Field label="Interest rate (%)">
            <NumberInput value={rate} onChange={setRate} min={0} max={15} step={0.1} />
          </Field>
        </div>
      </div>

      <div className="mt-5 rounded-card bg-brand-50 p-4">
        <p className="text-xs font-medium text-brand-700">Estimated monthly payment</p>
        <p className="mt-1 text-2xl font-bold text-brand-800">
          {formatPrice(Math.round(monthly), "EUR")}
          <span className="text-sm font-medium text-brand-600">/mo</span>
        </p>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This estimate is illustrative only and does not constitute financial advice or a
        loan offer. Contact a sponsored bank partner for a personalized quote.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">{label}</span>
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
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-neutral-200 px-3 py-2">
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
