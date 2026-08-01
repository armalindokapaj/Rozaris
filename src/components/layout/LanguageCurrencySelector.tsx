"use client";

import { useRef, useState } from "react";
import { Globe, ChevronDown, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/utils";

export function LanguageCurrencySelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { locale, setLocale, currency, setCurrency } = useAppStore();
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <Globe className="h-4 w-4" />
        <span>{locale.toUpperCase()}</span>
        <span className="text-neutral-300">/</span>
        <span>{currency}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 rounded-card border border-neutral-200 bg-white p-2 shadow-xl"
        >
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Language
          </p>
          {(
            [
              ["en", "English"],
              ["sq", "Shqip"],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              role="menuitemradio"
              aria-checked={locale === code}
              onClick={() => setLocale(code)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              {label}
              {locale === code && <Check className="h-4 w-4 text-brand-500" />}
            </button>
          ))}
          <div className="my-1.5 h-px bg-neutral-100" />
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Currency
          </p>
          {(
            [
              ["EUR", "Euro (€)"],
              ["ALL", "Lek (L)"],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              role="menuitemradio"
              aria-checked={currency === code}
              onClick={() => setCurrency(code)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
              )}
            >
              {label}
              {currency === code && <Check className="h-4 w-4 text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
