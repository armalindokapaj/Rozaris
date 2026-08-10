"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Headphones,
  Heart,
  Menu,
  Pencil,
  SquareStack,
  User,
} from "lucide-react";
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

function ResourceRow({
  href,
  icon: Icon,
  label,
  onClick,
  highlighted = false,
}: {
  href: string;
  icon: typeof User;
  label: string;
  onClick: () => void;
  /** "Become a Buyer" reads as the featured entry — brand-tinted badge/text
   * instead of neutral, same distinction the old list made with color alone. */
  highlighted?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3.5 px-5 py-4 hover:bg-neutral-50"
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          highlighted ? "bg-brand-50 text-brand-600" : "bg-neutral-100 text-neutral-600"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className={cn("flex-1 text-base font-semibold", highlighted ? "text-brand-600" : "text-neutral-900")}>
        {label}
      </span>
      <ChevronRight className={cn("h-4 w-4 shrink-0", highlighted ? "text-brand-500" : "text-neutral-400")} />
    </Link>
  );
}

function ResourcesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  useClickOutside(ref, () => setOpen(false), open);
  const close = () => setOpen(false);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-control px-2 py-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors",
          open ? "text-brand-600" : "text-neutral-600 hover:text-neutral-900"
        )}
      >
        {t("nav.resources")}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-1/2 z-40 mt-3 w-[23rem] max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-panel border border-neutral-200 bg-white shadow-[var(--shadow-3)]">
          <span
            aria-hidden="true"
            className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-neutral-200 bg-white"
          />
          <div className="relative divide-y divide-neutral-100">
            <ResourceRow
              href="/buyer/signup"
              icon={User}
              label={t("buyer.becomeABuyer")}
              onClick={close}
              highlighted
            />
            <ResourceRow
              href="/resources/mortgage-calculator"
              icon={Calculator}
              label={t("nav.mortgageCalculator")}
              onClick={close}
            />
            <ResourceRow
              href="/resources/redo-unit-design"
              icon={Pencil}
              label={t("nav.redoUnitDesign")}
              onClick={close}
            />
            <ResourceRow href="/help" icon={Headphones} label={t("nav.helpCenter")} onClick={close} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const compareCount = useAppStore((s) => s.compare.length);
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const { hint: compareHint, hintRef: compareHintRef, handleCompareClick } = useCompareHint();
  const { hint: savedHint, hintRef: savedHintRef, handleSavedClick } = useSavedHint();
  const { t } = useT();

  const navLinkClass =
    "rounded-control px-2 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600 hover:text-neutral-900 transition-colors";
  const activeNavLinkClass = (active: boolean) =>
    cn(navLinkClass, "relative", active && "text-neutral-900 after:absolute after:inset-x-2 after:-bottom-[1px] after:h-px after:bg-neutral-900");

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 lg:px-6">
        <Logo />

        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label={t("common.primaryNav")}>
          <Link href="/search" className={activeNavLinkClass(pathname === "/search")}>
            {t("nav.search")}
          </Link>
          <Link href="/new-projects" className={activeNavLinkClass(pathname === "/new-projects")}>
            {t("nav.newProjects")}
          </Link>
          <Link href="/developers" className={activeNavLinkClass(pathname === "/developers")}>
            {t("nav.findAgents")}
          </Link>
          <ResourcesDropdown />
          <Link href="/help#about" className={navLinkClass}>
            {t("nav.aboutUs")}
          </Link>
        </nav>

        {/* Mobile-only: Buy/Rent/New Projects live in the top bar next to
            the logo instead of their own search-row above the map. */}
        <div className="ml-1 flex min-w-0 items-center gap-1 lg:hidden">
          {(
            [
              ["buy", "nav.buy"],
              ["rent", "nav.rent"],
            ] as const
          ).map(([txn, labelKey]) => (
            <button
              key={txn}
              onClick={() => {
                setTransaction(txn);
                if (pathname !== "/search") router.push("/search");
              }}
              className={cn(
                "shrink-0 rounded-control px-2.5 py-1.5 text-xs font-semibold transition-colors",
                filters.transaction === txn && !filters.projectsOnly
                  ? "bg-brand-500 text-white"
                  : "bg-neutral-100 text-neutral-600"
              )}
            >
              {t(labelKey)}
            </button>
          ))}
          <button
            onClick={() => {
              setFilters({ projectsOnly: true });
              if (pathname !== "/search") router.push("/search");
            }}
            className={cn(
              "shrink truncate rounded-control px-2.5 py-1.5 text-xs font-semibold transition-colors",
              filters.projectsOnly ? "bg-brand-500 text-white" : "bg-neutral-100 text-neutral-600"
            )}
          >
            {t("nav.newProjects")}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <Link
            href="/saved"
            onClick={handleSavedClick}
            aria-label={t("nav.saved")}
            className="relative hidden items-center rounded-control p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:flex"
          >
            <Heart className="h-4 w-4" />
            {savedCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-semibold text-white">
                {savedCount}
              </span>
            )}
          </Link>
          <button
            onClick={handleCompareClick}
            aria-label={t("nav.compare")}
            className="relative hidden items-center rounded-control p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 sm:flex"
          >
            <SquareStack className="h-4 w-4" />
            {compareCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                {compareCount}
              </span>
            )}
          </button>
          <div className="hidden lg:block">
            <LanguageCurrencySelector />
          </div>
          <span className="hidden h-5 w-px bg-neutral-200 sm:block" aria-hidden="true" />
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
