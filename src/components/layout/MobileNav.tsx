"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Crown,
  FileText,
  Headphones,
  Heart,
  Info,
  LogOut,
  Plus,
  Scale,
  Search,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useSavedHint } from "@/hooks/useSavedHint";
import { CompareHint } from "@/components/compare/CompareHint";
import { LanguageCurrencySelector } from "./LanguageCurrencySelector";
import { cn } from "@/lib/utils";

/**
 * A row in the main nav list. `active` (current-page highlight) is real —
 * computed from `pathname`, not hardcoded — so it's correct wherever this
 * drawer is opened from, not just landing.
 */
function NavRow({
  href,
  icon: Icon,
  label,
  active,
  onClick,
  trailing,
}: {
  href?: string;
  icon: typeof Search;
  label: string;
  active?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  const content = (
    <>
      <Icon className={cn("h-5 w-5 shrink-0", active ? "text-brand-600" : "text-neutral-500")} />
      <span className={cn("flex-1 text-[15px]", active ? "font-bold text-brand-700" : "font-medium text-neutral-800")}>{label}</span>
      {trailing ?? <ChevronRight className={cn("h-4 w-4 shrink-0", active ? "text-brand-400" : "text-neutral-300")} />}
    </>
  );
  const className = cn(
    "flex items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors duration-100",
    active ? "bg-brand-50" : "hover:bg-neutral-50"
  );
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { auth, openSignIn, signOut, compare, setMode } = useAppStore();
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const { t } = useT();
  const { hint: savedHint, hintRef: savedHintRef, handleSavedClick } = useSavedHint();

  // Entrance-only animation: starts translated off-screen/transparent,
  // then flips to its resting state one frame after mount so the browser
  // actually has two distinct frames to transition between (setting both
  // in the same frame wouldn't animate at all). `setVisible` only ever
  // runs inside the rAF callback or this effect's cleanup, never
  // synchronously in the effect body itself. Closing is instant, same as
  // the drawer this replaces — an exit animation would need tracking a
  // third "still closing, not yet unmounted" state, not worth it here.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(id);
      setVisible(false);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
      {/* Dimmed backdrop over the ~30% of the screen the drawer doesn't
          cover — click closes, same as the X button. */}
      <button
        aria-label={t("nav.closeMenu")}
        onClick={onClose}
        className={cn("absolute inset-0 bg-neutral-900/45 transition-opacity duration-300 ease-[var(--ease-rz)]", visible ? "opacity-100" : "opacity-0")}
      />

      {/* The drawer itself — ~72% width, slides in from the right. */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[72%] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-[var(--ease-rz)]",
          visible ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 font-serif text-lg font-bold text-brand-600">
              R
            </span>
            <div>
              <p className="font-serif text-base font-bold tracking-[0.1em] text-neutral-900">ROZARIS</p>
              <p className="text-xs text-neutral-500">{t("nav.tagline")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("nav.closeMenu")}
            className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin px-3 py-1">
          <nav className="flex flex-col gap-0.5" aria-label={t("common.mobileNav")}>
            <NavRow
              href="/search"
              icon={Search}
              label={t("nav.search")}
              active={pathname === "/search"}
              onClick={() => {
                setMode("map");
                onClose();
              }}
            />
            <NavRow
              href="/new-projects"
              icon={Building2}
              label={t("nav.newProjects")}
              active={pathname === "/new-projects"}
              onClick={onClose}
            />
            <NavRow
              href="/developers"
              icon={User}
              label={t("nav.findAgents")}
              active={pathname === "/developers"}
              onClick={onClose}
            />
            <NavRow
              href="/rent-vs-buy"
              icon={CircleDollarSign}
              label={t("nav.rentVsBuy")}
              active={pathname === "/rent-vs-buy"}
              onClick={onClose}
            />

            <button
              type="button"
              onClick={() => setResourcesOpen((v) => !v)}
              aria-expanded={resourcesOpen}
              className="flex items-center gap-3.5 rounded-xl px-3 py-3 text-left hover:bg-neutral-50"
            >
              <FileText className="h-5 w-5 shrink-0 text-neutral-500" />
              <span className="flex-1 text-[15px] font-medium text-neutral-800">{t("nav.resources")}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-150", resourcesOpen && "rotate-180")} />
            </button>
            {resourcesOpen && (
              <div className="ml-11 flex flex-col gap-0.5 border-l border-neutral-100 pl-3">
                <Link href="/resources/mortgage-calculator" onClick={onClose} className="rounded-lg px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
                  {t("nav.mortgageCalculator")}
                </Link>
                <Link href="/resources/redo-unit-design" onClick={onClose} className="rounded-lg px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
                  {t("nav.redoUnitDesign")}
                </Link>
              </div>
            )}

            <NavRow href="/help#about" icon={Info} label={t("nav.aboutUs")} active={false} onClick={onClose} />
            <NavRow href="/help" icon={Headphones} label={t("nav.helpCenter")} active={pathname === "/help"} onClick={onClose} />
          </nav>

          <Link
            href="/dashboard"
            onClick={onClose}
            className="mt-3 flex items-center gap-3 rounded-card bg-brand-50 p-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-500">
              <Crown className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-neutral-900">{t("nav.listCardTitle")}</span>
              <span className="block text-xs leading-snug text-neutral-500">{t("nav.listCardBody")}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
          </Link>

          <Link
            href="/dashboard"
            onClick={onClose}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-bold text-white transition-colors duration-100 hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            {t("nav.addPropertyProject")}
          </Link>

          <div className="my-3 border-t border-neutral-100" />

          <nav className="flex flex-col gap-0.5">
            {/* Not NavRow: needs the real click event for useSavedHint's
                preventDefault()/clientX/clientY (empty-saved-list tooltip
                instead of navigating to an empty page), which NavRow's
                plain `() => void` onClick can't carry. */}
            <Link
              href="/saved"
              onClick={(e) => {
                handleSavedClick(e);
                if (savedCount === 0) return;
                onClose();
              }}
              className={cn(
                "flex items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors duration-100",
                pathname === "/saved" ? "bg-brand-50" : "hover:bg-neutral-50"
              )}
            >
              <Heart className={cn("h-5 w-5 shrink-0", pathname === "/saved" ? "text-brand-600" : "text-neutral-500")} />
              <span className={cn("flex-1 text-[15px]", pathname === "/saved" ? "font-bold text-brand-700" : "font-medium text-neutral-800")}>
                {t("nav.saved")}
              </span>
              <ChevronRight className={cn("h-4 w-4 shrink-0", pathname === "/saved" ? "text-brand-400" : "text-neutral-300")} />
            </Link>
            <NavRow
              icon={Scale}
              label={t("nav.compare")}
              onClick={() => {
                useAppStore.getState().setCompareOverlayOpen(true);
                onClose();
              }}
              trailing={
                compare.length > 0 ? (
                  <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white">{compare.length}</span>
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
                )
              }
            />
            <NavRow
              icon={User}
              label={t("nav.myAccount")}
              active={pathname === "/buyer/dashboard"}
              onClick={() => {
                if (auth.signedIn) {
                  router.push("/buyer/dashboard");
                } else {
                  openSignIn();
                }
                onClose();
              }}
            />
          </nav>
        </div>

        {/* Language/currency switching lives here on mobile — there's no
            other entry point for it below the `lg:` breakpoint (desktop's
            selector in Header is `hidden lg:block`). Not in the reference
            mockup for this drawer, kept anyway so switching languages
            doesn't regress into being mobile-unreachable. */}
        <div className="shrink-0 border-t border-neutral-100 px-5 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">{t("nav.language")}</span>
            <LanguageCurrencySelector openUpward />
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 px-3 py-2">
          {auth.signedIn ? (
            <button
              onClick={() => {
                signOut();
                onClose();
              }}
              className="flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-danger hover:bg-red-50"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {t("nav.signOut")}
            </button>
          ) : (
            <button
              onClick={() => {
                openSignIn();
                onClose();
              }}
              className="flex w-full items-center justify-center rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white"
            >
              {t("common.signIn")}
            </button>
          )}
        </div>
      </div>

      <CompareHint hint={savedHint} hintRef={savedHintRef} />
    </div>
  );
}
