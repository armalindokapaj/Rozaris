import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Currency } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EUR_TO_ALL = 99.5;

export function formatPrice(
  amount: number,
  currency: Currency = "EUR",
  opts: { compact?: boolean } = {}
) {
  const value = currency === "ALL" ? amount : amount;
  if (opts.compact) {
    const formatter = new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return `${currency === "EUR" ? "€" : "L"}${formatter.format(value)}`;
  }
  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  });
  return `${currency === "EUR" ? "€" : "L"}${formatter.format(value)}`;
}

export function convertCurrency(amount: number, to: Currency): number {
  // amounts are stored in EUR in mock data
  if (to === "EUR") return amount;
  return Math.round(amount * EUR_TO_ALL);
}

export function formatArea(area: number) {
  return `${area} m²`;
}

export function formatRelativeDate(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

export function transactionLabel(
  transaction: "sale" | "rent" | "coming_soon",
  rentSubtype?: "daily" | "long_term"
) {
  if (transaction === "sale") return "For Sale";
  if (transaction === "coming_soon") return "Coming Soon";
  return rentSubtype === "daily" ? "For Rent · Daily" : "For Rent";
}

export function whatsappHref(
  phoneE164: string,
  message: string
): string {
  const digits = phoneE164.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function telHref(phoneE164: string) {
  return `tel:${phoneE164}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
