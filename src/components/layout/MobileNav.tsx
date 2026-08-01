"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Info,
  LogOut,
  Map as MapIcon,
  SquareStack,
  Users,
  X,
  Heart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { PlaceholderImage } from "@/components/common/PlaceholderImage";
import { useT } from "@/lib/i18n/useT";
import { useSavedHint } from "@/hooks/useSavedHint";
import { CompareHint } from "@/components/compare/CompareHint";
import { LanguageCurrencySelector } from "./LanguageCurrencySelector";
import { cn } from "@/lib/utils";

const links = [
  { href: "/?mode=map", labelKey: "nav.map", icon: MapIcon },
  { href: "/saved", labelKey: "nav.saved", icon: Heart },
  { href: "/developers", labelKey: "nav.findAgents", icon: Users },
] as const;

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { auth, signIn, signOut, compare, setMode } = useAppStore();
  const savedCount = useAppStore((s) => s.saved.listings.length + s.saved.projects.length);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const { t } = useT();
  const { hint: savedHint, hintRef: savedHintRef, handleSavedClick } = useSavedHint();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden" role="dialog" aria-modal>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 px-4">
        <span className="flex items-center gap-2 font-bold text-neutral-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-500 text-white">
            R
          </span>
          ROZARIS
        </span>
        <button
          onClick={onClose}
          aria-label={t("nav.closeMenu")}
          className="rounded-control p-2 text-neutral-700 hover:bg-neutral-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-3">
        <nav className="flex flex-col gap-0.5" aria-label={t("common.mobileNav")}>
          {links.map(({ href, labelKey, icon: Icon }) => (
            <button
              key={labelKey}
              onClick={(e) => {
                if (labelKey === "nav.saved") {
                  handleSavedClick(e);
                  if (savedCount === 0) return;
                }
                if (labelKey === "nav.map") setMode("map");
                router.push(href.split("?")[0]);
                onClose();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <Icon className="h-5 w-5 text-neutral-500" />
              {t(labelKey)}
            </button>
          ))}
          <button
            onClick={() => {
              useAppStore.getState().setCompareOverlayOpen(true);
              onClose();
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <SquareStack className="h-5 w-5 text-neutral-500" />
            {t("nav.compare")}
            {compare.length > 0 && (
              <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                {compare.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              router.push("/new-projects");
              onClose();
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <Building2 className="h-5 w-5 text-neutral-500" />
            {t("nav.newProjects")}
          </button>

          <Link
            href="/buyer/signup"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-brand-600 hover:bg-brand-50"
          >
            <Heart className="h-5 w-5 text-brand-500" />
            {t("buyer.becomeABuyer")}
          </Link>

          <button
            onClick={() => setResourcesOpen((v) => !v)}
            aria-expanded={resourcesOpen}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <Info className="h-5 w-5 text-neutral-500" />
            {t("nav.resources")}
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 transition-transform",
                resourcesOpen && "rotate-180"
              )}
            />
          </button>
          {resourcesOpen && (
            <div className="ml-11 flex flex-col gap-0.5 border-l border-neutral-100 pl-3">
              <Link
                href="/resources/mortgage-calculator"
                onClick={onClose}
                className="rounded-lg px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {t("nav.mortgageCalculator")}
              </Link>
              <Link
                href="/help"
                onClick={onClose}
                className="rounded-lg px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {t("nav.helpCenter")}
              </Link>
            </div>
          )}

          <Link
            href="/help#about"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <Info className="h-5 w-5 text-neutral-500" />
            {t("nav.aboutUs")}
          </Link>
        </nav>

        <Link
          href="/dashboard"
          onClick={onClose}
          className="mt-4 flex items-center justify-between gap-3 rounded-card bg-brand-50 p-4"
        >
          <div>
            <p className="text-sm font-semibold text-brand-700">{t("nav.listCardTitle")}</p>
            <p className="mt-0.5 text-xs text-brand-600/80">{t("nav.listCardBody")}</p>
            <span className="mt-3 inline-block rounded-control bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white">
              {t("nav.becomeAPublisher")}
            </span>
          </div>
          <Building2 className="h-14 w-14 shrink-0 text-brand-300" strokeWidth={1.25} />
        </Link>
      </div>

      <div className="shrink-0 border-t border-neutral-200 px-4 py-3">
        {auth.signedIn ? (
          <>
            <Link
              href="/buyer/dashboard"
              onClick={onClose}
              className="mb-2 flex items-center gap-2 rounded-control px-2 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <Heart className="h-4 w-4" /> {t("nav.buyerDashboard")}
            </Link>
          <div className="flex items-center gap-3 py-2">
            <PlaceholderImage
              seed={auth.name ?? "user"}
              kind="avatar"
              className="h-10 w-10 rounded-full"
              iconClassName="h-5 w-5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900">{auth.name}</p>
              <p className="text-xs capitalize text-neutral-500">{auth.role}</p>
            </div>
            <button
              onClick={() => {
                signOut();
              }}
              aria-label={t("nav.signOut")}
              className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          </>
        ) : (
          <button
            onClick={() => signIn("John Doe", "publisher")}
            className="mb-2 w-full rounded-control bg-brand-500 py-2.5 text-sm font-semibold text-white"
          >
            {t("common.signIn")}
          </button>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-neutral-500">{t("nav.language")}</span>
          <LanguageCurrencySelector openUpward />
        </div>
      </div>
      <CompareHint hint={savedHint} hintRef={savedHintRef} />
    </div>
  );
}
