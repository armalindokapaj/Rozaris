"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Home, KeyRound, Maximize2, RotateCcw, TrendingDown, TrendingUp, X } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { usePriceFormat } from "@/hooks/usePriceFormat";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

type SimplePlan = { years: number; monthlyRent: number; rentIncreasePercent: number; homePrice: number; downPaymentPercent: number; mortgageRate: number; mortgageYears: number };

const DEFAULTS: SimplePlan = { years: 10, monthlyRent: 650, rentIncreasePercent: 3, homePrice: 180000, downPaymentPercent: 20, mortgageRate: 5.5, mortgageYears: 25 };

function monthlyPayment(price: number, downPercent: number, annualRate: number, years: number) {
  const borrowed = price * (1 - downPercent / 100);
  const months = years * 12;
  const rate = annualRate / 100 / 12;
  return rate === 0 ? borrowed / months : borrowed * (rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
}

export function RentVsBuyClient() {
  const searchParams = useSearchParams();
  const priceFmt = usePriceFormat();
  const { t } = useT();
  const [plan, setPlan] = useState<SimplePlan>(() => ({ ...DEFAULTS, ...(Number(searchParams.get("price")) > 0 ? { homePrice: Number(searchParams.get("price")) } : {}) }));
  const [chartOpen, setChartOpen] = useState(false);
  const mortgageMonthly = useMemo(() => monthlyPayment(plan.homePrice, plan.downPaymentPercent, plan.mortgageRate, plan.mortgageYears), [plan]);
  const months = plan.years * 12;
  const totalRent = Array.from({ length: plan.years }, (_, year) => plan.monthlyRent * 12 * Math.pow(1 + plan.rentIncreasePercent / 100, year)).reduce((sum, amount) => sum + amount, 0);
  const totalMortgagePaid = mortgageMonthly * months;
  const downPayment = plan.homePrice * (plan.downPaymentPercent / 100);
  const mortgageDifference = totalMortgagePaid + downPayment - totalRent;
  const better = mortgageDifference <= 0 ? "buy" : "rent";
  const series = Array.from({ length: plan.years + 1 }, (_, year) => ({ year, rent: Array.from({ length: year }, (_, rentYear) => plan.monthlyRent * 12 * Math.pow(1 + plan.rentIncreasePercent / 100, rentYear)).reduce((sum, amount) => sum + amount, 0), mortgage: mortgageMonthly * 12 * year + downPayment }));
  const set = <K extends keyof SimplePlan>(key: K, value: SimplePlan[K]) => setPlan((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="min-h-full bg-neutral-50">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{t("rentBuy.simpleEyebrow")}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">{t("rentBuy.simpleTitle")}</h1>
          <p className="mt-3 text-base leading-relaxed text-neutral-600">{t("rentBuy.simpleSubtitle")}</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
          <section className="border border-neutral-200 bg-white p-5">
            <p className="text-sm font-bold text-neutral-900">{t("rentBuy.simpleQuestions")}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">{t("rentBuy.simpleQuestionsHint")}</p>
            <div className="mt-5 space-y-5">
              <Field label={t("rentBuy.stayQuestion")} hint={t("rentBuy.stayHint")} value={plan.years} min={1} max={30} suffix={t("rentBuy.years")} onChange={(value) => set("years", value)} />
              <Field label={t("rentBuy.rentQuestion")} hint={t("rentBuy.rentHint")} value={plan.monthlyRent} min={100} max={5000} step={25} prefix="€" onChange={(value) => set("monthlyRent", value)} />
              <Field label={t("rentBuy.rentIncreaseSimple")} hint={t("rentBuy.rentIncreaseHint")} value={plan.rentIncreasePercent} min={3} max={20} suffix="%" onChange={(value) => set("rentIncreasePercent", value)} />
              <Field label={t("rentBuy.priceQuestion")} hint={t("rentBuy.priceHint")} value={plan.homePrice} min={30000} max={1000000} step={1000} prefix="€" onChange={(value) => set("homePrice", value)} />
              <Field label={t("rentBuy.downQuestion")} hint={t("rentBuy.downHint")} value={plan.downPaymentPercent} min={0} max={80} suffix="%" onChange={(value) => set("downPaymentPercent", value)} />
              <Field label={t("rentBuy.mortgageQuestion")} hint={t("rentBuy.mortgageHint")} value={plan.mortgageRate} min={0} max={15} step={0.1} suffix={t("rentBuy.rateSuffix")} onChange={(value) => set("mortgageRate", value)} />
              <div className="flex gap-2"><label className="sr-only">Mortgage years</label>{[10, 15, 20, 25, 30].map((years) => <button key={years} onClick={() => set("mortgageYears", years)} className={cn("h-10 flex-1 border text-xs font-bold", plan.mortgageYears === years ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-600")}>{years}y</button>)}</div>
            </div>
            <button onClick={() => setPlan(DEFAULTS)} className="mt-6 flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900"><RotateCcw className="h-3.5 w-3.5" /> {t("rentBuy.resetExample")}</button>
          </section>

          <section className="space-y-5">
            <div className={cn("border p-5 transition-all duration-500", better === "buy" ? "animate-[pulse_1.2s_ease-out_1] border-brand-400 bg-brand-50 shadow-[0_0_0_5px_rgba(107,85,245,0.10)]" : "border-neutral-300 bg-white")}>
              <div className="flex items-start gap-3"><span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", better === "buy" ? "bg-brand-500 text-white" : "bg-neutral-900 text-white")}>{better === "buy" ? <Home className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}</span><div><p className="text-sm font-bold text-neutral-900">{t(better === "buy" ? "rentBuy.buyCheaper" : "rentBuy.rentCheaper", { years: plan.years })}</p><p className="mt-1 text-sm leading-relaxed text-neutral-600">{t("rentBuy.directPaymentSummary", { rent: priceFmt(totalRent), mortgage: priceFmt(totalMortgagePaid + downPayment) })}</p></div></div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MoneyCard label={t("rentBuy.totalRentSimple")} value={priceFmt(totalRent)} note={t("rentBuy.yearsOfRent", { years: plan.years })} icon={<KeyRound className="h-4 w-4" />} />
              <MoneyCard label={t("rentBuy.mortgagePaymentsSimple")} value={priceFmt(totalMortgagePaid)} note={t("rentBuy.perMonth", { amount: priceFmt(mortgageMonthly) })} icon={<Home className="h-4 w-4" />} />
              <MoneyCard label={t("rentBuy.downPayment")} value={priceFmt(downPayment)} note={t("rentBuy.onceAtStart")} icon={<TrendingDown className="h-4 w-4" />} />
              <MoneyCard label={t("rentBuy.mortgagePaidSimple")} value={priceFmt(totalMortgagePaid + downPayment)} note={t("rentBuy.totalPayment")} icon={<TrendingUp className="h-4 w-4" />} />
            </div>
            <div className="border border-neutral-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-neutral-900">{t("rentBuy.moneyOverTime")}</h2><p className="mt-1 text-sm text-neutral-500">{t("rentBuy.chartHint")}</p></div><button aria-label={t("rentBuy.expandChart")} onClick={() => setChartOpen(true)} className="flex h-10 w-10 items-center justify-center border border-neutral-300 text-neutral-700 hover:border-neutral-900"><Maximize2 className="h-4 w-4" /></button></div><SimpleChart series={series} format={priceFmt} /><div className="mt-3 flex gap-4 text-xs text-neutral-500"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-neutral-500" /> {t("rentBuy.rentPaidSimple")}</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-500" /> {t("rentBuy.downAndMortgage")}</span></div></div>
            <div className="border border-neutral-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.1em] text-neutral-400">{t("rentBuy.whatItMeans")}</p><p className="mt-2 text-sm leading-relaxed text-neutral-600">{t("rentBuy.whatItMeansBody")}</p></div>
          </section>
        </div>
      </main>
      {chartOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4"><div className="relative flex h-[min(44rem,92vh)] w-full max-w-5xl flex-col bg-white p-5 sm:p-8"><button aria-label={t("common.close")} onClick={() => setChartOpen(false)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center border border-neutral-300"><X className="h-4 w-4" /></button><h2 className="text-2xl font-bold text-neutral-900">{t("rentBuy.chartModalTitle")}</h2><p className="mt-2 text-sm text-neutral-500">{t("rentBuy.chartHint")}</p><div className="min-h-0 flex-1"><SimpleChart expanded series={series} format={priceFmt} /></div></div></div>}
      <Footer />
    </div>
  );
}

function Field({ label, hint, value, min, max, step = 1, prefix = "", suffix = "", onChange }: { label: string; hint: string; value: number; min: number; max: number; step?: number; prefix?: string; suffix?: string; onChange: (value: number) => void }) {
  return <div><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-neutral-800">{label}</p><p className="mt-0.5 text-xs text-neutral-500">{hint}</p></div><span className="font-numeric whitespace-nowrap text-sm font-bold text-neutral-900">{prefix}{value.toLocaleString()}{suffix && ` ${suffix}`}</span></div><input className="mt-2 h-8 w-full accent-brand-500" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function MoneyCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) { return <div className="flex min-h-34 flex-col border border-neutral-200 bg-white p-3.5"><span className="text-brand-600">{icon}</span><p className="mt-2 min-h-8 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">{label}</p><p className="font-numeric mt-1 text-lg font-bold leading-6 text-neutral-900">{value}</p><p className="mt-auto pt-1.5 text-xs font-semibold text-brand-600">{note}</p></div>; }

function SimpleChart({ series, format, expanded = false }: { series: { year: number; rent: number; mortgage: number }[]; format: (value: number, options?: { compact?: boolean }) => string; expanded?: boolean }) {
  const { t } = useT();
  const [selectedYear, setSelectedYear] = useState(series.length - 1);
  const width = 640, height = expanded ? 420 : 220, pad = 34;
  const max = Math.max(...series.flatMap((point) => [point.rent, point.mortgage]), 1);
  const x = (year: number) => pad + (year / Math.max(1, series.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);
  const path = (key: "rent" | "mortgage") => series.map((point, index) => `${index ? "L" : "M"}${x(point.year)} ${y(point[key])}`).join(" ");
  const selected = series[selectedYear] ?? series[series.length - 1];
  return <div className="relative mt-4"><svg viewBox={`0 0 ${width} ${height}`} className="w-full cursor-crosshair" role="img" aria-label={t("rentBuy.chartAria")} onPointerMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); const year = Math.round(((event.clientX - box.left) / box.width) * (series.length - 1)); setSelectedYear(Math.max(0, Math.min(series.length - 1, year))); }} onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); const year = Math.round(((event.clientX - box.left) / box.width) * (series.length - 1)); setSelectedYear(Math.max(0, Math.min(series.length - 1, year))); }}><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} stroke="#e1e1e6" /><path d={path("rent")} fill="none" stroke="#666670" strokeWidth="3" /><path d={path("mortgage")} fill="none" stroke="#6b55f5" strokeWidth="3" /><line x1={x(selected.year)} y1={pad} x2={x(selected.year)} y2={height-pad} stroke="#c9c9d0" strokeDasharray="3 3" />{series.map((point) => <g key={point.year}><circle cx={x(point.year)} cy={y(point.rent)} r={point.year === selected.year ? 5 : 2} fill="#666670" /><circle cx={x(point.year)} cy={y(point.mortgage)} r={point.year === selected.year ? 5 : 2} fill="#6b55f5" /><text x={x(point.year)} y={height-8} fontSize="10" textAnchor="middle" fill="#8b8b95">{point.year}y</text></g>)}</svg><div className="grid grid-cols-3 gap-2 border border-neutral-200 bg-neutral-50 p-3 text-xs"><span><b>{t("rentBuy.yearLabel", { year: selected.year })}</b></span><span>{t("rentBuy.rentPaidSimple")}: <b className="font-numeric">{format(selected.rent)}</b></span><span>{t("rentBuy.mortgagePaidSimple")}: <b className="font-numeric">{format(selected.mortgage)}</b></span></div></div>;
}
