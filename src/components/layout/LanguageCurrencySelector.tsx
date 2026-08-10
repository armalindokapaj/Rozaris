"use client";

import { useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { cn } from "@/lib/utils";

const LANGUAGE_OPTIONS = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "sq", flag: "🇦🇱", label: "Shqip" },
] as const;

const CURRENCY_OPTIONS = [
  { code: "EUR", flag: "🇪🇺", label: "Euro (€)" },
  { code: "ALL", flag: "🇦🇱", label: "Lek (L)" },
] as const;

export function LanguageCurrencySelector({
  openUpward = false,
}: {
  /** The mobile nav's footer sits at the bottom of the screen — a
   * downward-opening dropdown there renders mostly off-screen. */
  openUpward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { locale, setLocale, currency, setCurrency } = useAppStore();
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);

  const activeLanguage = LANGUAGE_OPTIONS.find((o) => o.code === locale);
  const activeCurrency = CURRENCY_OPTIONS.find((o) => o.code === currency);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <span aria-hidden>{activeLanguage?.flag}</span>
        <span>{locale.toUpperCase()}</span>
        <span className="text-neutral-300">/</span>
        <span aria-hidden>{activeCurrency?.flag}</span>
        <span>{currency}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute right-0 z-40 w-56 rounded-card border border-neutral-200 bg-white p-2 shadow-[0_8px_24px_rgba(17,17,24,0.10)]",
            openUpward ? "bottom-full mb-2" : "mt-2"
          )}
        >
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {t("nav.language")}
          </p>
          {LANGUAGE_OPTIONS.map(({ code, flag, label }) => (
            <button
              key={code}
              role="menuitemradio"
              aria-checked={locale === code}
              onClick={() => setLocale(code)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              <span aria-hidden>{flag}</span>
              <span className="flex-1 text-left">{label}</span>
              {locale === code && <Check className="h-4 w-4 text-brand-500" />}
            </button>
          ))}
          <div className="my-1.5 h-px bg-neutral-100" />
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {t("nav.currency")}
          </p>
          {CURRENCY_OPTIONS.map(({ code, flag, label }) => (
            <button
              key={code}
              role="menuitemradio"
              aria-checked={currency === code}
              onClick={() => setCurrency(code)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
              )}
            >
              <span aria-hidden>{flag}</span>
              <span className="flex-1 text-left">{label}</span>
              {currency === code && <Check className="h-4 w-4 text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
