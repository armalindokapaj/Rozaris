"use client";

import { Landmark } from "lucide-react";
import { MortgageCalculator } from "@/components/listing/MortgageCalculator";
import { useT } from "@/lib/i18n/useT";

export function MortgageCalculatorPageClient() {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
          <Landmark className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{t("mortgage.title")}</h1>
          <p className="text-sm text-neutral-500">{t("mortgage.pageSubtitle")}</p>
        </div>
      </div>
      <MortgageCalculator />

      <div className="mt-8 rounded-panel border border-dashed border-neutral-300 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-800">{t("mortgage.sponsorTitle")}</p>
        <p className="mt-1 text-xs text-neutral-500">{t("mortgage.sponsorBody")}</p>
      </div>
    </div>
  );
}
