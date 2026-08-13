"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  CircleUserRound,
  Home,
  KeyRound,
  MapPin,
  Menu,
  Wallet,
} from "lucide-react";
import { MobileNav } from "@/components/layout/MobileNav";
import { PROPERTY_TYPES } from "@/components/search/FiltersForm";
import { PROPERTY_TYPE_LABELS } from "@/lib/constants";
import { useAppStore } from "@/lib/store";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useT } from "@/lib/i18n/useT";
import { cn, formatPrice } from "@/lib/utils";
import type { PropertyType } from "@/lib/types";
import { CYCLE_WORDS, tools, type DiscoveryMode } from "./LandingHero";
import { TypewriterWord } from "./TypewriterWord";

const MODES: { id: DiscoveryMode; label: string; icon: typeof Home }[] = [
  { id: "buy", label: "Buy", icon: Home },
  { id: "rent", label: "Rent", icon: KeyRound },
  { id: "new", label: "New Developments", icon: Building2 },
];

// Same brand dot-grid + gradient wash HeroWallpaper paints for desktop
// (see that file), reproduced as a plain static background here instead
// of mounting the interactive component: HeroWallpaper is `fixed` (a
// full-page layer) and tracks `mousemove`, neither of which suits a
// scoped, touch-only region. Spans the whole page below the header.
const WALLPAPER_STYLE: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, color-mix(in srgb, var(--color-brand-500) 22%, transparent) 1px, transparent 1px), linear-gradient(to bottom, var(--color-brand-50), var(--color-neutral-50) 55%, var(--color-brand-50))",
  backgroundSize: "20px 20px, 100% 100%",
};

const PRICE_MIN_STEPS = [50000, 100000, 200000, 500000];

/**
 * Custom tap-to-open field, replacing a native `<select>`. Native selects
 * render as the browser's/OS's own uncontrollable picker UI (a big wheel
 * overlay on mobile Safari, an inconsistent inline list elsewhere) — this
 * renders as a plain button + our own absolute-positioned panel instead,
 * so it looks and behaves the same as every other menu in the app
 * (Header's ResourcesDropdown uses the same open-state + useClickOutside
 * shape).
 */
function FieldDropdown({
  label,
  value,
  options,
  onSelect,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const isSet = value !== "";
  const selectedLabel = options.find((o) => o.value === value)?.label ?? label;

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-1 rounded-xl border border-neutral-200 bg-white px-3 text-left text-sm"
      >
        <span className={cn("truncate", isSet ? "font-semibold text-neutral-900" : "text-neutral-400")}>{selectedLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)]">
          {options.map((opt) => (
            <button
              key={opt.value || "_any"}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              className={cn(
                "block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors duration-100",
                opt.value === value ? "bg-brand-50 font-semibold text-brand-700" : "text-neutral-700 hover:bg-neutral-50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phone-only front page (< lg). No photo hero, no fixed bottom app nav,
 * heading animates the same word cycle as desktop, the wallpaper texture
 * backs the whole page below the header, and tools are a single
 * navbar-style bar split into 3 equal segments rather than cards.
 * Desktop (`lg:` and up) keeps rendering LandingHero's own markup.
 */
export function MobileLandingHero({
  mode,
  onSelectMode,
  onSearch,
}: {
  mode: DiscoveryMode;
  onSelectMode: (mode: DiscoveryMode) => void;
  onSearch: () => void;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const { t, locale } = useT();
  const propertyLabels = PROPERTY_TYPE_LABELS[locale];
  const selectedType = filters.propertyTypes[0] ?? "";

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-white lg:hidden">
      {/* Fixed header — hamburger / ROZARIS / account, three even columns
          so the wordmark is truly centered regardless of the icons'
          widths on either side. */}
      <div className="relative z-20 grid h-14 shrink-0 grid-cols-3 items-center border-b border-neutral-200 bg-white px-3">
        <button
          onClick={() => setNavOpen(true)}
          aria-label={t("nav.openMenu")}
          className="justify-self-start rounded-control p-2 text-neutral-900 hover:bg-neutral-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="justify-self-center font-serif text-lg tracking-[0.22em] text-neutral-900"
          aria-label={`ROZARIS — ${t("nav.home")}`}
        >
          ROZARIS
        </Link>
        <Link
          href="/buyer/dashboard"
          aria-label={t("nav.buyerDashboard")}
          className="justify-self-end rounded-control p-1.5 text-neutral-900 hover:bg-neutral-100"
        >
          <CircleUserRound className="h-7 w-7" strokeWidth={1.5} />
        </Link>
      </div>

      {/* Whole page below the header — one continuous wallpaper-textured
          background. Scrolls only if a given phone is short enough to
          need it; the header above never moves. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5" style={WALLPAPER_STYLE}>
        <h1 className="text-2xl font-extrabold leading-[1.15] text-neutral-900">
          Find <TypewriterWord words={CYCLE_WORDS} className="text-brand-600" />
          <br />
          that fits your life.
        </h1>
        <p className="mt-1.5 text-[13px] leading-snug text-neutral-600">
          Discover thousands of properties across Albania. Buy, rent, or explore new developments with confidence.
        </p>

        <div className="mt-3.5 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(17,24,39,0.1)]">
          <div className="grid grid-cols-3">
            {MODES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectMode(item.id)}
                  className={cn(
                    "flex h-11 flex-col items-center justify-center gap-0.5 px-1 text-center text-[10px] font-extrabold uppercase leading-tight tracking-[0.02em] transition-colors duration-150 ease-[var(--ease-rz)]",
                    item.id === mode ? "bg-brand-600 text-white" : "bg-white text-neutral-500"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 p-3">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3">
              <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                value={filters.location}
                onChange={(event) => setFilters({ location: event.target.value })}
                placeholder={t("filters.locationPlaceholder")}
                className="h-full w-full min-w-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
              />
              <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
            </label>

            <div className="grid grid-cols-[1.3fr_1fr] gap-2">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-neutral-200 px-3">
                <Wallet className="h-4 w-4 shrink-0 text-neutral-400" />
                <input
                  type="number"
                  inputMode="numeric"
                  value={filters.priceMax ?? ""}
                  onChange={(event) => setFilters({ priceMax: event.target.value ? Number(event.target.value) : null })}
                  placeholder="Budget max"
                  className="h-full w-full min-w-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                />
              </label>
              <FieldDropdown
                label="€ Any"
                value={filters.priceMin != null ? String(filters.priceMin) : ""}
                onSelect={(v) => setFilters({ priceMin: v ? Number(v) : null })}
                options={[
                  { value: "", label: "€ Any" },
                  ...PRICE_MIN_STEPS.map((step) => ({ value: String(step), label: `${formatPrice(step, "EUR", { compact: true })}+` })),
                ]}
              />
            </div>

            <div className="grid grid-cols-[1.3fr_1fr] gap-2">
              <FieldDropdown
                label="Property type or rooms"
                value={selectedType}
                onSelect={(v) => setFilters({ propertyTypes: v ? [v as PropertyType] : [] })}
                options={[
                  { value: "", label: "Property type or rooms" },
                  ...PROPERTY_TYPES.map((pt) => ({ value: pt, label: propertyLabels[pt] })),
                ]}
              />
              <FieldDropdown
                label="Any"
                value={filters.bedrooms != null ? String(filters.bedrooms) : ""}
                onSelect={(v) => setFilters({ bedrooms: v ? Number(v) : null })}
                options={[
                  { value: "", label: "Any" },
                  { value: "1", label: "1+ bedroom" },
                  { value: "2", label: "2+ bedrooms" },
                  { value: "3", label: "3+ bedrooms" },
                  { value: "4", label: "4+ bedrooms" },
                ]}
              />
            </div>

            <button
              onClick={onSearch}
              className="mt-0.5 flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-extrabold uppercase tracking-[0.08em] text-neutral-900 transition-colors duration-150 ease-[var(--ease-rz)] active:bg-accent-600"
            >
              View properties
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tools — one bar, divided into 3 equal segments (navbar-style),
            not separate cards. Reuses desktop's `tools` content (icon +
            title; the description doesn't fit a segment this narrow). */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_4px_16px_rgba(17,24,39,0.06)]">
          <div className="grid grid-cols-3 divide-x divide-neutral-100">
            {tools.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-1.5 px-2 py-4 text-center transition-colors duration-150 active:bg-neutral-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="line-clamp-2 text-[11px] font-bold leading-tight text-neutral-900">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
    </div>
  );
}
