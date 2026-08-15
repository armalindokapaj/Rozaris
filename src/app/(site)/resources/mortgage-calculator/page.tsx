import type { Metadata } from "next";
import { MortgageCalculatorPageClient } from "@/components/resources/MortgageCalculatorPageClient";
import { getPageSeo } from "@/lib/pageSeo";

export async function generateMetadata(): Promise<Metadata> {
  return getPageSeo("mortgageCalculator");
}

export default function MortgageCalculatorPage() {
  return <MortgageCalculatorPageClient />;
}
