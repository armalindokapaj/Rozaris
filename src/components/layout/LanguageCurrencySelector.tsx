"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useDropdown } from "@/hooks/useDropdown";
import { DropdownPanel, DropdownMenuItem, DropdownSectionLabel, DropdownSeparator } from "@/components/ui/Dropdown";
import { useT } from "@/lib/i18n/useT";

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
  variant = "inline",
}: {
  openUpward?: boolean;
  variant?: "inline" | "tile";
}) {
  const { open, toggle, close, ref } = useDropdown<HTMLDivElement>();
  const { locale, setLocale, currency, setCurrency } = useAppStore();
  const { t } = useT();

  const activeLanguage = LANGUAGE_OPTIONS.find((o) => o.code === locale);
  const activeCurrency = CURRENCY_OPTIONS.find((o) => o.code === currency);

  const panel = (
    <DropdownPanel openUpward={openUpward} align={variant === "tile" ? "left" : "right"}>
      <DropdownSectionLabel>{t("nav.language")}</DropdownSectionLabel>
      {LANGUAGE_OPTIONS.map(({ code, flag, label }) => (
        <DropdownMenuItem
          key={code}
          role="menuitemradio"
          icon={<span aria-hidden>{flag}</span>}
          selected={locale === code}
          onClick={() => {
            setLocale(code);
            close();
          }}
        >
          {label}
        </DropdownMenuItem>
      ))}
      <DropdownSeparator />
      <DropdownSectionLabel>{t("nav.currency")}</DropdownSectionLabel>
      {CURRENCY_OPTIONS.map(({ code, flag, label }) => (
        <DropdownMenuItem
          key={code}
          role="menuitemradio"
          icon={<span aria-hidden>{flag}</span>}
          selected={currency === code}
          onClick={() => {
            setCurrency(code);
            close();
          }}
        >
          {label}
        </DropdownMenuItem>
      ))}
    </DropdownPanel>
  );

  if (variant === "tile") {
    return (
      <div className="relative flex-1" ref={ref}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex w-full flex-col items-center gap-1.5 px-2 py-4 text-center transition-colors duration-150 active:bg-neutral-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-inset ring-brand-100">
            <Globe className="h-4 w-4" />
          </span>
          <span className="text-[11px] font-bold leading-tight text-neutral-900">
            {locale.toUpperCase()} / {currency}
          </span>
        </button>
        {open && panel}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
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
      {open && panel}
    </div>
  );
}
