import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { MortgageCalculator } from "@/components/listing/MortgageCalculator";

export const metadata: Metadata = {
  title: "Mortgage calculator",
  description: "Estimate your monthly mortgage payment for a property in Albania.",
};

export default function MortgageCalculatorPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
          <Landmark className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Mortgage calculator</h1>
          <p className="text-sm text-neutral-500">
            Get an illustrative monthly payment estimate for sale listings.
          </p>
        </div>
      </div>
      <MortgageCalculator />

      <div className="mt-8 rounded-panel border border-dashed border-neutral-300 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-800">Sponsored by our banking partners</p>
        <p className="mt-1 text-xs text-neutral-500">
          Admin can assign a local bank sponsor with disclosed rates and lead routing
          (Section 19.2). No sponsor is currently configured for this market.
        </p>
      </div>
    </div>
  );
}
