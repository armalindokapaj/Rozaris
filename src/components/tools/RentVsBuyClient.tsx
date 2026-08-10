"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Info,
  PiggyBank,
  RotateCcw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { HeroSketch } from "@/components/common/HeroSketch";
import { Footer } from "@/components/layout/Footer";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";
import {
  calculateRentVsBuy,
  RENT_VS_BUY_DEFAULTS,
  type RentBuyScenario,
} from "@/lib/rentVsBuy";

// PRD_Rent_vs_Buy.pdf v1.0 — see the calculation engine's own header comment
// (src/lib/rentVsBuy.ts) for the formula-level citations. This client owns
// the UI only: inputs, chart, breakdown, sensitivity, FAQ, disclaimer.
// Deferred (see chat): saved/shared scenarios (needs auth+DB), Admin
// calculator-config panel, formal analytics events (no pipeline exists in
// this app yet), automated test suite (no test framework configured in
// this repo — verified instead via a one-off scratch script against every
// §21 test scenario before this UI was built).

const FAQ_KEYS = [
  "compare",
  "breakEven",
  "monthlyVsFinish",
  "opportunityCost",
  "buyingCosts",
  "rentingCosts",
  "holdingPeriod",
  "alwaysBetter",
  "estimates",
] as const;

function buildSensitivityOverrides(
  scenario: RentBuyScenario
): { labelKey: string; overrides: Partial<RentBuyScenario> }[] {
  return [
    { labelKey: "sensMortgageUp", overrides: { mortgageRateAnnual: scenario.mortgageRateAnnual + 0.01 } },
    { labelKey: "sensMortgageDown", overrides: { mortgageRateAnnual: Math.max(0, scenario.mortgageRateAnnual - 0.01) } },
    { labelKey: "sensHoldingLonger", overrides: { holdingPeriodYears: Math.min(30, scenario.holdingPeriodYears + 3) } },
    { labelKey: "sensHoldingShorter", overrides: { holdingPeriodYears: Math.max(1, scenario.holdingPeriodYears - 3) } },
    { labelKey: "sensAppreciationUp", overrides: { homeAppreciationAnnual: scenario.homeAppreciationAnnual + 0.01 } },
    { labelKey: "sensAppreciationDown", overrides: { homeAppreciationAnnual: scenario.homeAppreciationAnnual - 0.01 } },
  ];
}

export function RentVsBuyClient() {
  const searchParams = useSearchParams();
  const { t } = useT();
  const priceFmt = usePriceFormat();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [scenario, setScenario] = useState<RentBuyScenario>(() => {
    const prefillPrice = Number(searchParams.get("price"));
    const prefillLocation = searchParams.get("location");
    return {
      ...RENT_VS_BUY_DEFAULTS,
      ...(prefillPrice > 0 ? { propertyPrice: prefillPrice } : {}),
      ...(prefillLocation ? { locationText: prefillLocation } : {}),
    };
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const result = useMemo(() => calculateRentVsBuy(scenario), [scenario]);

  function set<K extends keyof RentBuyScenario>(key: K, value: RentBuyScenario[K]) {
    setScenario((s) => ({ ...s, [key]: value }));
  }

  function reset() {
    setScenario(RENT_VS_BUY_DEFAULTS);
  }

  const downPaymentAmount = scenario.propertyPrice * scenario.downPaymentPercent;

  const sensitivityRows = useMemo(() => {
    return buildSensitivityOverrides(scenario).map(({ labelKey, overrides }) => {
      const altResult = calculateRentVsBuy({ ...scenario, ...overrides });
      return { labelKey, winner: altResult.winner, advantage: altResult.advantageAmount };
    });
  }, [scenario]);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <h1 className="font-serif text-4xl text-neutral-900 sm:text-5xl">{t("rentBuy.title")}</h1>
            <p className="mt-2 text-sm text-neutral-500 sm:text-base">{t("rentBuy.subtitle")}</p>
          </div>
          <HeroSketch className="hidden h-28 w-48 shrink-0 text-neutral-300 sm:block" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
          {/* --- Assumption editor --- */}
          <aside className="space-y-5 rounded-panel border border-neutral-200 bg-white p-5 lg:sticky lg:top-20">
            <div>
              <SectionLabel>{t("rentBuy.yourInformation")}</SectionLabel>
              <label className="mt-2 block">
                <span className="text-xs text-neutral-500">{t("rentBuy.location")}</span>
                <input
                  value={scenario.locationText}
                  onChange={(e) => set("locationText", e.target.value)}
                  className="mt-1 w-full rounded-control border border-neutral-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
                />
              </label>
              <SliderField
                label={t("rentBuy.holdingPeriod")}
                value={scenario.holdingPeriodYears}
                min={1}
                max={30}
                step={1}
                suffix={t("rentBuy.years")}
                onChange={(v) => set("holdingPeriodYears", v)}
              />
            </div>

            <div className="border-t border-neutral-100 pt-4">
              <SectionLabel>{t("rentBuy.rentDetails")}</SectionLabel>
              <SliderField
                label={t("rentBuy.monthlyRent")}
                value={scenario.rentMonthly}
                min={200}
                max={3000}
                step={10}
                prefix="€"
                onChange={(v) => set("rentMonthly", v)}
              />
              <SliderField
                label={t("rentBuy.annualRentIncrease")}
                value={Math.round(scenario.rentGrowthAnnual * 1000) / 10}
                min={0}
                max={10}
                step={0.1}
                suffix="%"
                onChange={(v) => set("rentGrowthAnnual", v / 100)}
              />
            </div>

            <div className="border-t border-neutral-100 pt-4">
              <SectionLabel>{t("rentBuy.buyDetails")}</SectionLabel>
              <SliderField
                label={t("rentBuy.propertyPrice")}
                value={scenario.propertyPrice}
                min={30000}
                max={800000}
                step={1000}
                prefix="€"
                onChange={(v) => set("propertyPrice", v)}
              />
              <div>
                <SliderField
                  label={t("rentBuy.downPayment")}
                  value={Math.round(scenario.downPaymentPercent * 1000) / 10}
                  min={0}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={(v) => set("downPaymentPercent", v / 100)}
                />
                <p className="-mt-2 text-xs text-neutral-400">{priceFmt(downPaymentAmount, { compact: true })}</p>
              </div>
              <SliderField
                label={t("rentBuy.mortgageRate")}
                value={Math.round(scenario.mortgageRateAnnual * 1000) / 10}
                min={0}
                max={15}
                step={0.1}
                suffix="%"
                onChange={(v) => set("mortgageRateAnnual", v / 100)}
              />
              <SliderField
                label={t("rentBuy.loanTerm")}
                value={scenario.loanTermYears}
                min={5}
                max={40}
                step={1}
                suffix={t("rentBuy.years")}
                onChange={(v) => set("loanTermYears", v)}
              />
            </div>

            <details className="border-t border-neutral-100 pt-4" open={advancedOpen}>
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  setAdvancedOpen((v) => !v);
                }}
                className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-brand-600"
              >
                {advancedOpen ? t("rentBuy.hideAdvanced") : t("rentBuy.showAdvanced")}
              </summary>
              {advancedOpen && (
                <div className="mt-3 space-y-1">
                  <SliderField label={t("rentBuy.homeAppreciation")} value={Math.round(scenario.homeAppreciationAnnual * 1000) / 10} min={-5} max={10} step={0.1} suffix="%" onChange={(v) => set("homeAppreciationAnnual", v / 100)} />
                  <SliderField label={t("rentBuy.propertyTax")} value={Math.round(scenario.propertyTaxRateAnnual * 1000) / 10} min={0} max={3} step={0.05} suffix="%" onChange={(v) => set("propertyTaxRateAnnual", v / 100)} />
                  <SliderField label={t("rentBuy.homeInsurance")} value={scenario.homeInsuranceMonthly} min={0} max={200} step={5} prefix="€" onChange={(v) => set("homeInsuranceMonthly", v)} />
                  <SliderField label={t("rentBuy.maintenance")} value={Math.round(scenario.maintenanceRateAnnual * 1000) / 10} min={0} max={3} step={0.05} suffix="%" onChange={(v) => set("maintenanceRateAnnual", v / 100)} />
                  <SliderField label={t("rentBuy.hoa")} value={scenario.hoaMonthly} min={0} max={300} step={5} prefix="€" onChange={(v) => set("hoaMonthly", v)} />
                  <SliderField label={t("rentBuy.closingCosts")} value={Math.round(scenario.purchaseClosingCostRate * 1000) / 10} min={0} max={10} step={0.1} suffix="%" onChange={(v) => set("purchaseClosingCostRate", v / 100)} />
                  <SliderField label={t("rentBuy.sellingCosts")} value={Math.round(scenario.sellingCostRate * 1000) / 10} min={0} max={12} step={0.1} suffix="%" onChange={(v) => set("sellingCostRate", v / 100)} />
                  <SliderField label={t("rentBuy.renterInsurance")} value={scenario.renterInsuranceMonthly} min={0} max={50} step={1} prefix="€" onChange={(v) => set("renterInsuranceMonthly", v)} />
                  <SliderField label={t("rentBuy.securityDeposit")} value={scenario.securityDepositMonths} min={0} max={6} step={1} suffix={t("rentBuy.months")} onChange={(v) => set("securityDepositMonths", v)} />
                  <SliderField label={t("rentBuy.movingCosts")} value={scenario.renterMovingCosts} min={0} max={3000} step={50} prefix="€" onChange={(v) => set("renterMovingCosts", v)} />
                  <SliderField label={t("rentBuy.investmentReturn")} value={Math.round(scenario.investmentReturnAnnual * 1000) / 10} min={0} max={15} step={0.1} suffix="%" onChange={(v) => set("investmentReturnAnnual", v / 100)} />
                  <SliderField label={t("rentBuy.investmentFeeDrag")} value={Math.round(scenario.investmentFeeDragAnnual * 1000) / 10} min={0} max={3} step={0.05} suffix="%" onChange={(v) => set("investmentFeeDragAnnual", v / 100)} />
                </div>
              )}
            </details>

            <div className="flex gap-2 border-t border-neutral-100 pt-4">
              <button
                onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="flex-1 rounded-control bg-brand-500 py-3 text-sm font-semibold text-white hover:bg-brand-600 lg:hidden"
              >
                {t("rentBuy.calculate")}
              </button>
              <button
                onClick={reset}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-control border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("common.reset")}
              </button>
            </div>
          </aside>

          {/* --- Results --- */}
          <div ref={resultsRef} className="min-w-0 space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard
                label={t("rentBuy.summaryRent")}
                value={priceFmt(result.rentNetPosition, { compact: true })}
                sub={t("rentBuy.netPositionAt", { years: scenario.holdingPeriodYears })}
              />
              <SummaryCard
                label={t("rentBuy.summaryBuy")}
                value={priceFmt(result.buyNetPosition, { compact: true })}
                sub={t("rentBuy.netPositionAt", { years: scenario.holdingPeriodYears })}
                highlighted={result.winner === "buy"}
              />
              <SummaryCard
                label={t("rentBuy.summaryBreakEven")}
                value={
                  result.breakEvenMonth
                    ? t("rentBuy.yearsMonths", {
                        years: Math.floor(result.breakEvenMonth / 12),
                        months: result.breakEvenMonth % 12,
                      })
                    : t("rentBuy.noBreakEven", { years: scenario.holdingPeriodYears })
                }
                sub={t("rentBuy.breakEvenSub")}
              />
            </div>

            <div className="flex items-center gap-2 rounded-control bg-brand-50 px-4 py-3 text-sm text-brand-800">
              {result.winner === "buy" ? (
                <TrendingUp className="h-4 w-4 shrink-0" />
              ) : result.winner === "rent" ? (
                <TrendingDown className="h-4 w-4 shrink-0" />
              ) : (
                <Scale className="h-4 w-4 shrink-0" />
              )}
              <span>
                {result.winner === "tie"
                  ? t("rentBuy.resultTie")
                  : t("rentBuy.resultWinner", {
                      winner: result.winner === "buy" ? t("rentBuy.buying") : t("rentBuy.renting"),
                      amount: priceFmt(result.advantageAmount, { compact: true }),
                    })}
              </span>
            </div>

            <div className="rounded-panel border border-neutral-200 bg-white p-5">
              <h2 className="font-serif text-lg text-neutral-900">{t("rentBuy.chartTitle")}</h2>
              <NetPositionChart
                series={result.annualSeries}
                breakEvenMonth={result.breakEvenMonth}
                hoverYear={hoverYear}
                onHoverYear={setHoverYear}
                formatValue={(v) => priceFmt(v, { compact: true })}
                yearLabel={(year) => t("rentBuy.yearLabel", { year })}
              />
              <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-neutral-400" /> {t("rentBuy.summaryRent")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-500" /> {t("rentBuy.summaryBuy")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BreakdownCard
                title={t("rentBuy.rentBreakdown")}
                total={result.rentNetPosition}
                rows={[
                  [t("rentBuy.bdRentPaid"), result.breakdown.rent.rentPaid],
                  [t("rentBuy.bdRenterInsurance"), result.breakdown.rent.renterInsurance],
                  [t("rentBuy.bdMovingCosts"), result.breakdown.rent.movingCosts],
                  [t("rentBuy.bdInvestmentGrowth"), result.breakdown.rent.investmentGrowth],
                  [t("rentBuy.bdFinalInvestment"), result.breakdown.rent.finalInvestmentAccount],
                ]}
                formatValue={(v) => priceFmt(v, { compact: true })}
              />
              <BreakdownCard
                title={t("rentBuy.buyBreakdown")}
                total={result.buyNetPosition}
                rows={[
                  [t("rentBuy.bdDownPayment"), result.breakdown.buy.downPayment],
                  [t("rentBuy.bdMortgageInterest"), result.breakdown.buy.mortgageInterest],
                  [t("rentBuy.bdPropertyTax"), result.breakdown.buy.propertyTax],
                  [t("rentBuy.bdMaintenance"), result.breakdown.buy.maintenance],
                  [t("rentBuy.bdSellingCosts"), result.breakdown.buy.sellingCosts],
                  [t("rentBuy.bdCashRecovered"), result.breakdown.buy.cashRecoveredAtSale],
                ]}
                formatValue={(v) => priceFmt(v, { compact: true })}
              />
            </div>

            <div className="rounded-panel border border-neutral-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4 text-brand-500" />
                <h2 className="font-serif text-lg text-neutral-900">{t("rentBuy.sensitivityTitle")}</h2>
              </div>
              <p className="mt-1 text-sm text-neutral-500">{t("rentBuy.sensitivitySubtitle")}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sensitivityRows.map((row) => (
                  <div
                    key={row.labelKey}
                    className="flex items-center justify-between gap-2 rounded-control border border-neutral-200 px-3.5 py-2.5 text-sm"
                  >
                    <span className="text-neutral-600">{t(`rentBuy.${row.labelKey}`)}</span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold",
                        row.winner === "buy" ? "text-brand-600" : row.winner === "rent" ? "text-neutral-500" : "text-neutral-400"
                      )}
                    >
                      {row.winner === "tie" ? t("rentBuy.resultTieShort") : `${row.winner === "buy" ? t("rentBuy.buying") : t("rentBuy.renting")} +${priceFmt(row.advantage, { compact: true })}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-panel border border-neutral-200 bg-white p-5">
              <h2 className="font-serif text-lg text-neutral-900">{t("rentBuy.faqTitle")}</h2>
              <div className="mt-3 space-y-2.5">
                {FAQ_KEYS.map((key) => (
                  <details key={key} className="group rounded-card border border-neutral-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-neutral-900">
                      {t(`rentBuy.faq_${key}_q`)}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="px-4 pb-4 text-sm leading-relaxed text-neutral-600">{t(`rentBuy.faq_${key}_a`)}</p>
                  </details>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-control bg-neutral-50 p-4 text-xs text-neutral-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{t("rentBuy.disclaimer")}</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{children}</p>;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span className="flex items-center gap-1 font-semibold text-neutral-800">
          {prefix}
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-16 rounded-[4px] border border-transparent bg-transparent text-right text-neutral-800 hover:border-neutral-200 focus:border-brand-400 focus:outline-none"
          />
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-11 w-full accent-brand-500 sm:h-6"
        aria-label={label}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  highlighted = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-panel border p-4",
        highlighted ? "border-brand-300 bg-brand-50" : "border-neutral-200 bg-white"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={cn("mt-1 font-serif text-2xl", highlighted ? "text-brand-700" : "text-neutral-900")}>{value}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  total,
  rows,
  formatValue,
}: {
  title: string;
  total: number;
  rows: [string, number][];
  formatValue: (v: number) => string;
}) {
  return (
    <div className="rounded-panel border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        <span className="font-serif text-lg text-neutral-900">{formatValue(total)}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs text-neutral-500">
            <span>{label}</span>
            <span className="font-medium text-neutral-700">{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetPositionChart({
  series,
  breakEvenMonth,
  hoverYear,
  onHoverYear,
  formatValue,
  yearLabel,
}: {
  series: { year: number; rentNet: number; buyNet: number }[];
  breakEvenMonth: number | null;
  hoverYear: number | null;
  onHoverYear: (y: number | null) => void;
  formatValue: (v: number) => string;
  yearLabel: (year: number) => string;
}) {
  const width = 640;
  const height = 220;
  const padding = { top: 10, right: 10, bottom: 24, left: 10 };
  const values = series.flatMap((p) => [p.rentNet, p.buyNet]);
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const span = maxV - minV || 1;
  const maxYear = series[series.length - 1]?.year ?? 1;

  const x = (year: number) => padding.left + (year / maxYear) * (width - padding.left - padding.right);
  const y = (v: number) => padding.top + (1 - (v - minV) / span) * (height - padding.top - padding.bottom);

  const rentPath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.year)} ${y(p.rentNet)}`).join(" ");
  const buyPath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.year)} ${y(p.buyNet)}`).join(" ");
  const zeroY = y(0);

  const hovered = hoverYear != null ? series.find((p) => p.year === hoverYear) : null;

  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => onHoverYear(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const year = Math.round(((relX - padding.left) / (width - padding.left - padding.right)) * maxYear);
          if (year >= 0 && year <= maxYear) onHoverYear(year);
        }}
      >
        <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke="#e1e1e6" strokeWidth={1} />
        {breakEvenMonth != null && (
          <line
            x1={x(breakEvenMonth / 12)}
            y1={padding.top}
            x2={x(breakEvenMonth / 12)}
            y2={height - padding.bottom}
            stroke="#a794fa"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        <path d={rentPath} fill="none" stroke="#666670" strokeWidth={2.5} />
        <path d={buyPath} fill="none" stroke="#6b55f5" strokeWidth={2.5} />
        {hovered && (
          <line
            x1={x(hovered.year)}
            y1={padding.top}
            x2={x(hovered.year)}
            y2={height - padding.bottom}
            stroke="#c9c9d0"
            strokeWidth={1}
          />
        )}
        {series.map((p) => (
          <text key={p.year} x={x(p.year)} y={height - 6} fontSize={9} fill="#8b8b95" textAnchor="middle">
            {p.year}
          </text>
        ))}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 rounded-control border border-neutral-200 bg-white px-2.5 py-1.5 text-xs shadow-[var(--shadow-2)]"
          style={{ left: `${(x(hovered.year) / width) * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold text-neutral-900">{yearLabel(hovered.year)}</p>
          <p className="text-neutral-500">{formatValue(hovered.rentNet)}</p>
          <p className="text-brand-600">{formatValue(hovered.buyNet)}</p>
        </div>
      )}
    </div>
  );
}
