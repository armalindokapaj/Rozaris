"use client";

import { useState } from "react";
import { Landmark, ShieldCheck } from "lucide-react";
import { MortgageCalculator } from "@/components/listing/MortgageCalculator";
import { InsuranceCalculator } from "@/components/listing/InsuranceCalculator";
import { AffordabilityCalculator } from "@/components/listing/AffordabilityCalculator";
import { SponsorAdCard } from "@/components/listing/SponsorAdCard";
import { useT } from "@/lib/i18n/useT";

export function MortgageCalculatorPageClient() {
  const { t } = useT();
  const [monthlyPayment, setMonthlyPayment] = useState(0);

  return (
    // Same p-4 outer spacing and gap-4 column rhythm as the Front Page's
    // three-column row, so both side panels sit the same distance from the
    // header/edges and from the middle column as everywhere else on the site.
    <div className="px-4 py-4 lg:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left panel: bank sponsor. */}
        <aside className="shrink-0 lg:sticky lg:top-20 lg:w-72">
          <SponsorAdCard
            icon={Landmark}
            name={t("mortgage.bankSponsorName")}
            tagline={t("mortgage.bankSponsorTagline")}
          />
        </aside>

        {/* Middle: the calculators themselves. */}
        <div className="min-w-0 flex-1 space-y-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-50">
              <Landmark className="h-5 w-5 text-brand-600" />
            </span>
            <div>
              <h1 className="font-serif text-xl text-neutral-900">{t("mortgage.title")}</h1>
              <p className="text-sm text-neutral-500">{t("mortgage.pageSubtitle")}</p>
            </div>
          </div>
          <MortgageCalculator onMonthlyChange={setMonthlyPayment} />
          <AffordabilityCalculator monthlyPayment={monthlyPayment} />
        </div>

        {/* Right panel: insurance calculator, then its sponsor below. */}
        <aside className="shrink-0 space-y-4 lg:sticky lg:top-20 lg:w-72">
          <div className="glass-panel overflow-hidden rounded-panel">
            <div className="border-b border-neutral-100 px-5 pt-5 pb-4">
              <h2 className="text-[15px] font-bold text-neutral-900">{t("insurance.title")}</h2>
            </div>
            <div className="p-5">
              <InsuranceCalculator compact />
            </div>
          </div>
          <SponsorAdCard
            icon={ShieldCheck}
            name={t("mortgage.insuranceSponsorName")}
            tagline={t("mortgage.insuranceSponsorTagline")}
          />
        </aside>
      </div>
    </div>
  );
}
