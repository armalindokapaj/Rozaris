"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useCompareHint } from "@/hooks/useCompareHint";
import { CompareHint } from "@/components/compare/CompareHint";
import { Logo } from "./Logo";
import { LanguageCurrencySelector } from "./LanguageCurrencySelector";
import { AccountMenu } from "./AccountMenu";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/utils";

function ResourcesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-control px-2 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
      >
        Resources <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-56 rounded-card border border-neutral-200 bg-white p-1.5 shadow-xl">
          <Link
            href="/resources/mortgage-calculator"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Mortgage calculator
          </Link>
          <Link
            href="/developers"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Verified developers
          </Link>
          <Link
            href="/help"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Help center
          </Link>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const compareCount = useAppStore((s) => s.compare.length);
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const { hint, hintRef, handleCompareClick } = useCompareHint();

  function goHomeWithTransaction(transaction: "buy" | "rent") {
    setFilters({ transaction, projectsOnly: false });
    if (pathname !== "/") router.push("/");
  }

  function goNewProjects() {
    setFilters({ projectsOnly: true });
    if (pathname !== "/") router.push("/");
  }

  function goCommercial() {
    setFilters({ propertyTypes: ["commercial", "office"], projectsOnly: false });
    if (pathname !== "/") router.push("/");
  }

  const navLinkClass =
    "rounded-control px-2 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/95 px-4 backdrop-blur lg:px-6">
        <Logo />

        <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          <button
            onClick={() => goHomeWithTransaction("buy")}
            className={cn(
              navLinkClass,
              filters.transaction === "buy" && !filters.projectsOnly && "text-neutral-900"
            )}
          >
            Buy
          </button>
          <button
            onClick={() => goHomeWithTransaction("rent")}
            className={cn(
              navLinkClass,
              filters.transaction === "rent" && "text-neutral-900"
            )}
          >
            Rent
          </button>
          <button
            onClick={goNewProjects}
            className={cn(navLinkClass, filters.projectsOnly && "text-neutral-900")}
          >
            New Projects
          </button>
          <button onClick={goCommercial} className={navLinkClass}>
            Commercial
          </button>
          <Link href="/developers" className={navLinkClass}>
            Find Agents
          </Link>
          <ResourcesDropdown />
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <Link
            href="/dashboard"
            className="hidden rounded-control px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 md:block"
          >
            List your property
          </Link>
          <Link
            href="/saved"
            className="hidden items-center gap-1.5 rounded-control px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:flex"
          >
            <Heart className="h-4 w-4" />
            Saved
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
            Compare
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
            aria-label="Open menu"
            className="rounded-control p-2 text-neutral-700 hover:bg-neutral-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <CompareHint hint={hint} hintRef={hintRef} />
    </>
  );
}
