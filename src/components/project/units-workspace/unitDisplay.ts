import type { Currency } from "@/lib/types";

export function convertUnitPrice(amountInUnitCurrency: number, unitCurrency: Currency, displayCurrency: Currency, eurToAllRate: number): number {
  if (unitCurrency === displayCurrency) return amountInUnitCurrency;
  if (unitCurrency === "EUR" && displayCurrency === "ALL") return amountInUnitCurrency * eurToAllRate;
  if (unitCurrency === "ALL" && displayCurrency === "EUR") return amountInUnitCurrency / eurToAllRate;
  return amountInUnitCurrency;
}

const SQM_TO_SQFT = 10.7639;

export function formatUnitArea(areaSqm: number, unit: "m2" | "ft2"): string {
  if (unit === "ft2") return `${Math.round(areaSqm * SQM_TO_SQFT)} ft²`;
  return `${areaSqm} m²`;
}

export function areaToDisplay(areaSqm: number, unit: "m2" | "ft2"): number {
  return unit === "ft2" ? Math.round(areaSqm * SQM_TO_SQFT) : areaSqm;
}

export function areaFromDisplay(value: number, unit: "m2" | "ft2"): number {
  return unit === "ft2" ? Math.round(value / SQM_TO_SQFT) : value;
}
