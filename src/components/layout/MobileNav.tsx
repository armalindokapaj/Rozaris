"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Scale,
  Search,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { useSavedHint } from "@/hooks/useSavedHint";
import { CompareHint } from "@/components/compare/CompareHint";
import { LanguageCurrencySelector } from "./LanguageCurrencySelector";
import { MenuToggleIcon } from "./MenuToggleIcon";
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
      <span className={cn("flex-1 text-[15px] font-bold", active ? "text-brand-700" : "text-neutral-800")}>{label}</span>
      {trailing ?? <ChevronRight className="h-4 w-4 shrink-0 text-accent" />}
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
  const pathname = usePathname();
  const { auth, openSignIn, signOut, compare, setMode } = useAppStore();
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const { t } = useT();
  const { hint: savedHint, hintRef: savedHintRef, handleSavedClick } = useSavedHint();

  // Always mounted (no conditional unmount, no local animation state) —
  // every class below is driven straight off the `open` prop, so the same
  // DOM node transitions in *and* out symmetrically via plain CSS. The
  // previous version unmounted on `!open`, which meant open had a real
  // slide/fade transition (a freshly-mounted node animating to its
  // resting state) while close was an instant cut (unmounting mid-CSS-
  // transition doesn't let it finish) — this fixes that asymmetry.
  // `inert` (not just `aria-hidden`) keeps the closed drawer's links and
  // buttons out of tab order and unclickable without needing
  // `pointer-events-none` sprinkled on every interactive child.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      inert={!open}
    >
      {/* Dimmed backdrop over the ~30% of the screen the drawer doesn't
          cover — click closes, same as the X button. Fades independently
          of the panel's slide (see below) — the dim is what should fade,
          not the drawer itself. */}
      <button
        aria-label={t("nav.closeMenu")}
        onClick={onClose}
        className={cn("absolute inset-0 bg-neutral-900/45 transition-opacity duration-300 ease-[var(--ease-rz)]", open ? "opacity-100" : "opacity-0")}
      />

      {/* The drawer itself — ~72% width, a pure slide: fully opaque the
          entire time, only `transform` animates, right to left on open and
          straight back out to the right on close (the same motion in
          reverse, not a different close effect). Deliberately no opacity
          transition on this panel — a solid card fading while it also
          moves reads as flimsy/glitchy; fading was tried and cut for
          exactly that reason. `duration-[420ms]` + `--ease-rz`'s strong
          deceleration (cubic-bezier(0.2,0,0,1), fast start / hard settle,
          no bounce) is what actually reads as "premium" here — a snappier
          300ms felt utilitarian, a spring/overshoot would feel playful
          rather than premium for a real-estate app. `will-change-transform`
          keeps 72%-width repaint smooth on mid-tier phones. */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-[72%] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-[420ms] ease-[var(--ease-rz)] will-change-transform",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Same bar as the Front Page header (MobileLandingHero) — wordmark
            left, toggle right, identical height/padding/border — so the
            close button lands in exactly the position the hamburger that
            opened this drawer occupies, and the hamburger→X morph
            (MenuToggleIcon) reads as one continuous motion in place rather
            than two different-looking buttons swapping. Wordmark is a real
            link to the front page here too, same as the Front Page's own
            header — not just decorative text. */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 px-5">
          <Link
            href="/"
            onClick={onClose}
            className="font-serif text-lg font-bold tracking-[0.24em] text-neutral-900"
            aria-label={`ROZARIS — ${t("nav.home")}`}
          >
            ROZARIS
          </Link>
          <button
            onClick={onClose}
            aria-label={t("nav.closeMenu")}
            className="-mr-2.5 rounded-control p-2.5 text-neutral-900 transition-colors hover:bg-neutral-100 active:bg-neutral-100"
          >
            <MenuToggleIcon open={open} />
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
              <span className="flex-1 text-[15px] font-bold text-neutral-800">{t("nav.resources")}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-accent transition-transform duration-150", resourcesOpen && "rotate-180")} />
            </button>
            {resourcesOpen && (
              <div className="ml-11 flex flex-col gap-0.5 border-l border-neutral-100 pl-3">
                <Link href="/resources/mortgage-calculator" onClick={onClose} className="rounded-lg px-2 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100">
                  {t("nav.mortgageCalculator")}
                </Link>
                <Link href="/resources/redo-unit-design" onClick={onClose} className="rounded-lg px-2 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100">
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
            className="mt-3 flex items-center gap-2.5 rounded-card bg-brand-50 px-3.5 py-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-500">
              <Crown className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-neutral-900">{t("nav.listCardTitle")}</span>
              <span className="block text-xs font-bold text-neutral-500">{t("nav.listCardBody")}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-accent" />
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
              <span className={cn("flex-1 text-[15px] font-bold", pathname === "/saved" ? "text-brand-700" : "text-neutral-800")}>
                {t("nav.saved")}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-accent" />
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
                  <ChevronRight className="h-4 w-4 shrink-0 text-accent" />
                )
              }
            />
            {/* Signed-in only — last item, directly above the Language
                footer, always highlighted (brand-tinted, not just when
                `pathname` happens to match) since this is the one row
                whose whole point is "go to your account", not a page
                among peers. */}
            {auth.signedIn && (
              <Link
                href="/buyer/dashboard"
                onClick={onClose}
                className="flex items-center gap-3.5 rounded-xl bg-brand-50 px-3 py-3 text-left transition-colors duration-100 hover:bg-brand-100"
              >
                <User className="h-5 w-5 shrink-0 text-brand-600" />
                <span className="flex-1 text-[15px] font-bold text-brand-700">{t("nav.myAccount")}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-accent" />
              </Link>
            )}
          </nav>
        </div>

        {/* Language/currency switching lives here on mobile — there's no
            other entry point for it below the `lg:` breakpoint (desktop's
            selector in Header is `hidden lg:block`). Not in the reference
            mockup for this drawer, kept anyway so switching languages
            doesn't regress into being mobile-unreachable. */}
        <div className="shrink-0 border-t border-neutral-100 px-5 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500">{t("nav.language")}</span>
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
              className="flex w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left text-[15px] font-bold text-danger hover:bg-red-50"
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
              className="flex w-full items-center justify-center rounded-xl bg-neutral-900 py-3 text-sm font-bold text-white"
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
