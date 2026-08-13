"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Calculator, ChevronRight, CircleDollarSign, Home, KeyRound, Sparkles } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { HeroWallpaper } from "./HeroWallpaper";
import { LandingSearchCard } from "./LandingSearchCard";
import { MobileLandingHero } from "./MobileLandingHero";
import { TypewriterWord } from "./TypewriterWord";

// Exported for MobileLandingHero, which shares this session's mode
// selection/search logic rather than keeping its own copy of it.
export type DiscoveryMode = "buy" | "rent" | "new";

const MODES: { id: DiscoveryMode; label: string; icon: typeof Home }[] = [
  { id: "buy", label: "Buy", icon: Home },
  { id: "rent", label: "Rental", icon: KeyRound },
  { id: "new", label: "New developments", icon: Building2 },
];

// Exported so MobileLandingHero's heading animates the exact same cycle
// instead of a second, drifting copy of the word list.
export const CYCLE_WORDS = ["home", "apartment", "villa", "house", "studio"];

// Exported — MobileLandingHero's tools grid reuses this verbatim (same
// titles/descriptions the mockup's mobile tool cards show) instead of
// keeping a second, drifting copy.
export const tools = [
  {
    href: "/rent-vs-buy",
    icon: CircleDollarSign,
    title: "Rent vs Buy",
    description: "Compare costs and benefits to make the right decision.",
  },
  {
    href: "/new-projects",
    icon: Building2,
    title: "Explore New Developments",
    description: "Browse the latest projects and invest in tomorrow.",
  },
  {
    href: "/resources/mortgage-calculator",
    icon: Calculator,
    title: "Plan Your Mortgage",
    description: "Estimate payments and find the best mortgage for you.",
  },
];

export function LandingHero() {
  const router = useRouter();
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const setMode = useAppStore((s) => s.setMode);
  const [mode, setDiscoveryMode] = useState<DiscoveryMode>("buy");

  function selectMode(next: DiscoveryMode) {
    setDiscoveryMode(next);
    setTransaction(next === "rent" ? "rent" : "buy");
    setFilters({ projectsOnly: next === "new" });
  }

  function search() {
    setMode("map");
    setTransaction(mode === "rent" ? "rent" : "buy");
    setFilters({ projectsOnly: mode === "new" });
    router.push("/search");
  }

  return (
    <div className="relative min-h-dvh">
      {/* Phone/tablet (< lg): a bienici-style photo hero with the logo and
          menu overlaid directly on it, fitted to one screen with no
          scroll. See MobileLandingHero for why it doesn't just reflow the
          desktop markup below. */}
      <MobileLandingHero mode={mode} onSelectMode={selectMode} onSearch={search} />

      {/* Desktop (>= lg): unchanged split hero + wallpaper backdrop. */}
      <div className="hidden lg:block">
        {/* Fixed full-page backdrop — sits behind the header, hero and
            tools row alike, not boxed into one column. */}
        <HeroWallpaper />

        <main className="relative z-10 min-h-dvh">
          <Header />

          {/* Single centered column, not a 2-col grid with an empty second
              cell — that empty half read as a layout bug ("empty space on
              the right") rather than intentional breathing room once the
              page was actually looked at on a real desktop screen. */}
          <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-brand-100 bg-white px-4 py-1.5 text-sm font-semibold text-brand-700 shadow-[0_2px_10px_rgba(17,24,39,0.06)]">
              <Sparkles className="h-4 w-4 text-accent" />
              Your next chapter starts here
            </span>

            {/* Two fixed rows on purpose: the animated word's width changes
                as it types/backspaces, and letting "that fits your life"
                share a line with it meant that line's wrap point shifted
                underneath it constantly. A hard break keeps row two static
                regardless of what row one is doing. */}
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.15] tracking-tight text-neutral-900 sm:text-5xl lg:text-[3.2rem]">
              Find <TypewriterWord words={CYCLE_WORDS} className="text-brand-600" />
              <br />
              that fits your life.
            </h1>

            <p className="mt-3 max-w-md text-lg leading-relaxed text-neutral-600">
              Discover thousands of properties across Albania. Buy, rent, or explore new developments with confidence.
            </p>

            <div className="mt-5 max-w-lg border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
              <div className="grid grid-cols-3">
                {MODES.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectMode(item.id)}
                      className={cn(
                        "flex min-h-14 items-center justify-center gap-2 border-b-2 px-2 text-center text-xs font-extrabold uppercase leading-tight tracking-[0.04em] transition-all duration-150 ease-[var(--ease-rz)]",
                        item.id === mode
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-transparent bg-white text-neutral-500 hover:bg-neutral-50 hover:text-brand-700"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <LandingSearchCard onSubmit={search} />
            </div>
          </section>

          <section className="mx-auto max-w-[88rem] px-5 pb-8 sm:px-8 lg:px-12 lg:pb-12">
            <div className="grid gap-3 sm:grid-cols-3">
              {tools.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 border border-neutral-200 bg-white p-3.5 transition-all duration-150 ease-[var(--ease-rz)] hover:-translate-y-1 hover:border-brand-200 hover:shadow-[var(--shadow-2)]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-transform duration-150 ease-[var(--ease-rz)] group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-extrabold text-neutral-900">{item.title}</span>
                      <span className="block text-xs leading-snug text-neutral-500">{item.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-150 group-hover:translate-x-1 group-hover:text-brand-600" />
                  </Link>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
