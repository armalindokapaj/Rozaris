import type { Metadata } from "next";
import { MortgageCalculatorPageClient } from "@/components/resources/MortgageCalculatorPageClient";

export const metadata: Metadata = {
  title: "Kalkulatori i kredisë",
  description: "Vlerëso pagesën tënde mujore të kredisë për një pronë në Shqipëri.",
};

export default function MortgageCalculatorPage() {
  return <MortgageCalculatorPageClient />;
}
