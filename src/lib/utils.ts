import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Currency, Locale } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// sq-AL groups thousands with a space ("150 000") rather than en-US's comma
// ("150,000") — in Albanian, a comma is the decimal separator, so showing
// prices with commas reads as a foreign format (or worse, a different
// number). ROZARIS defaults to the `sq` locale, so that's the default here
// too; pass `locale: "en"` explicitly for the few call sites that render
// under an English UI.
const PRICE_INTL_LOCALE: Record<Locale, string> = { en: "en-US", sq: "sq-AL" };

export function formatPrice(
  amount: number,
  currency: Currency = "EUR",
  opts: { compact?: boolean; locale?: Locale } = {}
) {
  const value = currency === "ALL" ? amount : amount;
  const intlLocale = PRICE_INTL_LOCALE[opts.locale ?? "sq"];
  if (opts.compact) {
    const formatter = new Intl.NumberFormat(intlLocale, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return `${currency === "EUR" ? "€" : "L"}${formatter.format(value)}`;
  }
  const formatter = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 0,
  });
  return `${currency === "EUR" ? "€" : "L"}${formatter.format(value)}`;
}

export function formatArea(area: number) {
  return `${area} m²`;
}

const RELATIVE_DATE_LABELS: Record<Locale, {
  today: string;
  oneDayAgo: string;
  daysAgo: (n: number) => string;
  moAgo: (n: number) => string;
  yrAgo: (n: number) => string;
}> = {
  en: {
    today: "Today",
    oneDayAgo: "1 day ago",
    daysAgo: (n) => `${n} days ago`,
    moAgo: (n) => `${n} mo ago`,
    yrAgo: (n) => `${n} yr ago`,
  },
  sq: {
    today: "Sot",
    oneDayAgo: "1 ditë më parë",
    daysAgo: (n) => `${n} ditë më parë`,
    moAgo: (n) => `${n} muaj më parë`,
    yrAgo: (n) => `${n} vjet më parë`,
  },
};

export function formatRelativeDate(iso: string, locale: Locale = "en") {
  const labels = RELATIVE_DATE_LABELS[locale];
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return labels.today;
  if (days === 1) return labels.oneDayAgo;
  if (days < 30) return labels.daysAgo(days);
  const months = Math.floor(days / 30);
  if (months < 12) return labels.moAgo(months);
  return labels.yrAgo(Math.floor(months / 12));
}

const TRANSACTION_LABELS: Record<Locale, { sale: string; comingSoon: string; rent: string; rentDaily: string }> = {
  en: { sale: "For Sale", comingSoon: "Coming Soon", rent: "For Rent", rentDaily: "For Rent · Daily" },
  sq: { sale: "Në Shitje", comingSoon: "Së Shpejti", rent: "Me Qira", rentDaily: "Me Qira · Ditore" },
};

export function transactionLabel(
  transaction: "sale" | "rent" | "coming_soon",
  rentSubtype?: "daily" | "long_term",
  locale: Locale = "en"
) {
  const labels = TRANSACTION_LABELS[locale];
  if (transaction === "sale") return labels.sale;
  if (transaction === "coming_soon") return labels.comingSoon;
  return rentSubtype === "daily" ? labels.rentDaily : labels.rent;
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

/** Generic kebab-case slug generation — a create-form's own text (a
 * listing title, an account/publisher name) that never collects a slug
 * directly. Uniqueness (appending `-2`, `-3`, ...) is the caller's job;
 * see `POST /api/listings` and `POST /api/auth/signup` for the same
 * dedupe-loop shape `POST /api/projects` already established. */
export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (ë, ç, etc.)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

/**
 * Human file size for admin/upload UI. Extracted here because three
 * byte-identical private copies already existed (the New Project page,
 * MapModelEditor, DetailModelUpload) and the 3D Health "Project 3D files"
 * panel would have been a fourth. Behaviour is deliberately unchanged
 * from those copies — MB to one decimal above 1 MB, whole KB below, and
 * never "0 KB" for a file that does have bytes.
 *
 * The three existing copies are intentionally left in place: swapping
 * them is a pure refactor with no behavioural payoff, and those files are
 * edited concurrently elsewhere.
 */
export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
