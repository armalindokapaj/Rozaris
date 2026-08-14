"use client";

import { ChevronDown } from "lucide-react";
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
}: {
  /** The mobile nav's footer sits at the bottom of the screen — a
   * downward-opening dropdown there renders mostly off-screen. */
  openUpward?: boolean;
}) {
  const { open, toggle, close, ref } = useDropdown<HTMLDivElement>();
  const { locale, setLocale, currency, setCurrency } = useAppStore();
  const { t } = useT();

  const activeLanguage = LANGUAGE_OPTIONS.find((o) => o.code === locale);
  const activeCurrency = CURRENCY_OPTIONS.find((o) => o.code === currency);

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
      {open && (
        <DropdownPanel openUpward={openUpward}>
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
      )}
    </div>
  );
}
