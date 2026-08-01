import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { MortgageCalculator } from "@/components/listing/MortgageCalculator";

export const metadata: Metadata = {
  title: "Kalkulatori i kredisë",
  description: "Vlerëso pagesën tënde mujore të kredisë për një pronë në Shqipëri.",
};

export default function MortgageCalculatorPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
          <Landmark className="h-5 w-5 text-brand-600" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Kalkulatori i kredisë</h1>
          <p className="text-sm text-neutral-500">
            Merr një vlerësim ilustrues të pagesës mujore për listimet në shitje.
          </p>
        </div>
      </div>
      <MortgageCalculator />

      <div className="mt-8 rounded-panel border border-dashed border-neutral-300 bg-white p-5">
        <p className="text-sm font-semibold text-neutral-800">Sponsorizuar nga partnerët tanë bankarë</p>
        <p className="mt-1 text-xs text-neutral-500">
          Admini mund të caktojë një bankë sponsorizuese lokale me norma të deklaruara dhe
          drejtim kontaktesh. Aktualisht nuk ka sponsor të konfiguruar për këtë treg.
        </p>
      </div>
    </div>
  );
}
