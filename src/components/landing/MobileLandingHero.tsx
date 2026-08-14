"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Home,
  KeyRound,
  MapPin,
  Wallet,
} from "lucide-react";
import { MobilePromoBanner } from "./MobilePromoBanner";
import { Button } from "@/components/ui/Button";
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
        <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-[var(--shadow-2)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
 * Phone-only front page (< lg). No photo hero, no fixed 5-item app nav
 * (that was removed outright — this is a *different* bottom bar: just the
 * 3 tools, pinned below the scrollable search area), heading animates the
 * same word cycle as desktop, and the wallpaper texture backs the whole
 * page below the header — search area and tools bar both float on it.
 * Desktop (`lg:` and up) keeps rendering LandingHero's own markup.
 *
 * No header of its own — Top Bar + Menu are static everywhere in the app
 * (per that rule), so `LandingHero` renders the one shared `<Header/>`
 * above this component instead of this component having its own
 * wordmark+hamburger variant. `h-full` (not `h-dvh`) is deliberate: this
 * now sits inside a flex-1 sibling of that Header, not the whole
 * viewport, so it should fill whatever's left, not re-claim the full
 * screen height and overlap the real header above it.
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
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const { t, locale } = useT();
  const propertyLabels = PROPERTY_TYPE_LABELS[locale];
  const selectedType = filters.propertyTypes[0] ?? "";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white lg:hidden">
      {/* One continuous wallpaper-textured background, from the top of
          this component (right under the shared Header) down to the very
          bottom of the screen (behind both the scrollable search area and
          the tools bar pinned below it). */}
      <div className="relative flex min-h-0 flex-1 flex-col" style={WALLPAPER_STYLE}>
        {/* Scrollable search area, top-aligned close under the header
            rather than vertically centered — centering left no room for
            the promo banner below the search card without either card
            fighting for the same dead space. What used to be bare
            wallpaper between the card and the pinned tools bar is now the
            banner's slot. Scrollbar hidden — a classic (non-overlay)
            browser scrollbar reserves gutter width for `overflow-y-auto`
            even with nothing to scroll, which read as a permanent empty
            strip on the right; scrolling itself still works, only the
            visible track is suppressed. `overflow-x-hidden` is required,
            not decorative: the promo banner's edge-to-edge card track
            bleeds past this container's own `px-5` via a negative margin,
            and per the CSS overflow spec, setting only `overflow-y`
            computes `overflow-x` to `auto` on the other axis too — without
            this, that horizontal overflow turned the *entire* search area
            (not just the banner) into a second, whole-page horizontal
            scroller, which is exactly the "empty space on the right,
            everything drags sideways" bug this fixes. */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-h-full flex-col justify-start pt-4 pb-5">
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

              <Button
                variant="accent"
                size="lg"
                onClick={onSearch}
                className="mt-0.5 shrink-0 active:bg-accent-600"
              >
                View properties
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <MobilePromoBanner />
        </div>
        </div>

        {/* Tools bar — pinned to the bottom of the screen (not inline
            right after the search card, which left a large dead gap
            above it once the descriptions were dropped), one bar divided
            into 3 equal segments. Still floats on the same wallpaper
            texture as the search area above it. Reuses desktop's `tools`
            content (icon + title only — description doesn't fit a
            segment this narrow). */}
        <div className="shrink-0 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_4px_16px_rgba(17,24,39,0.06)]">
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
      </div>
    </div>
  );
}
