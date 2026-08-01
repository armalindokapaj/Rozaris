"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useCompareHint } from "@/hooks/useCompareHint";
import { useSavedHint } from "@/hooks/useSavedHint";
import { useT } from "@/lib/i18n/useT";
import { CompareHint } from "@/components/compare/CompareHint";
import { Logo } from "./Logo";
import { LanguageCurrencySelector } from "./LanguageCurrencySelector";
import { AccountMenu } from "./AccountMenu";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";

function ResourcesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-control px-2 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
      >
        {t("nav.resources")} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-56 rounded-card border border-neutral-200 bg-white p-1.5 shadow-xl">
          <Link
            href="/buyer/signup"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            {t("buyer.becomeABuyer")}
          </Link>
          <div className="my-1.5 h-px bg-neutral-100" />
          <Link
            href="/resources/mortgage-calculator"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            {t("nav.mortgageCalculator")}
          </Link>
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            {t("nav.helpCenter")}
          </Link>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const compareCount = useAppStore((s) => s.compare.length);
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const { hint: compareHint, hintRef: compareHintRef, handleCompareClick } = useCompareHint();
  const { hint: savedHint, hintRef: savedHintRef, handleSavedClick } = useSavedHint();
  const { t } = useT();

  const navLinkClass =
    "rounded-control px-2 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur lg:px-6">
        <Logo />

        <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label={t("common.primaryNav")}>
          <Link
            href="/new-projects"
            className={cn(
              "rounded-control px-2 py-2 text-sm font-medium text-neutral-600 transition-all duration-200 hover:scale-105 hover:bg-brand-50 hover:text-brand-600",
              pathname === "/new-projects" && "text-neutral-900"
            )}
          >
            {t("nav.newProjects")}
          </Link>
          <Link href="/developers" className={navLinkClass}>
            {t("nav.findAgents")}
          </Link>
          <ResourcesDropdown />
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <Link
            href="/saved"
            onClick={handleSavedClick}
            className="hidden items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:flex"
          >
            <Heart className="h-4 w-4" />
            {t("nav.saved")}
            {savedCount > 0 && (
              <span className="ml-0.5 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700">
                {savedCount}
              </span>
            )}
          </Link>
          <button
            onClick={handleCompareClick}
            className="hidden items-center gap-1.5 rounded-control border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:flex"
          >
            <SquareStack className="h-4 w-4" />
            {t("nav.compare")}
            {compareCount > 0 && (
              <span className="ml-0.5 rounded-full bg-brand-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {compareCount}
              </span>
            )}
          </button>
          <div className="hidden lg:block">
            <LanguageCurrencySelector />
          </div>
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label={t("nav.openMenu")}
            className="rounded-control p-2 text-neutral-700 hover:bg-neutral-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <CompareHint hint={compareHint} hintRef={compareHintRef} />
      <CompareHint hint={savedHint} hintRef={savedHintRef} />
    </>
  );
}
