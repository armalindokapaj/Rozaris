"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Calculator, ChevronRight, CircleDollarSign, Lightbulb } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { SentenceFilterBar } from "@/components/search/SentenceFilterBar";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type DiscoveryMode = "buy" | "rent" | "new";

const MODES: { id: DiscoveryMode; label: string; image: string; heading: string }[] = [
  { id: "buy", label: "Buy", image: "/landing/hero-buy.png", heading: "Imagine yourself there.\nReally." },
  { id: "rent", label: "Rental", image: "/landing/hero-rent.png", heading: "Find a place that\nfeels like home." },
  { id: "new", label: "New developments", image: "/landing/hero-new.png", heading: "See what is being\nbuilt next." },
];

const tools = [
  { href: "/rent-vs-buy", icon: CircleDollarSign, label: "Rent vs Buy" },
  { href: "/new-projects", icon: Lightbulb, label: "Explore new developments" },
  { href: "/rent-vs-buy", icon: Calculator, label: "Plan your mortgage" },
];

export function LandingHero() {
  const router = useRouter();
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const setMode = useAppStore((s) => s.setMode);
  const [mode, setDiscoveryMode] = useState<DiscoveryMode>("buy");
  const active = MODES.find((item) => item.id === mode) ?? MODES[0];

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
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-neutral-100">
      <Header />

      <section className="relative min-h-[44rem] flex-1 overflow-hidden lg:min-h-[calc(100dvh-4rem)]">
        {MODES.map((item) => (
          // eslint-disable-next-line @next/next/no-img-element -- full-bleed illustrative city scene
          <img key={item.id} src={item.image} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-700", item.id === mode ? "opacity-100" : "opacity-0")} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10" />

        <div className="relative z-10 mx-auto flex h-full max-w-[96rem] items-center justify-end px-5 py-10 sm:px-8 lg:px-12 lg:pb-28">
          <div className="w-full max-w-[36rem]">
            <h1 className="mb-6 whitespace-pre-line text-4xl font-extrabold leading-[0.94] tracking-tight text-white drop-shadow-[0_3px_4px_rgba(0,0,0,0.36)] sm:text-5xl lg:text-6xl">
              {active.heading}
            </h1>

            <div className="landing-search-tabs grid grid-cols-3 gap-1">
                {MODES.map((item) => (
                  <button key={item.id} onClick={() => selectMode(item.id)} className={cn("flex min-h-14 items-center justify-center border px-2 text-center text-[11px] font-extrabold uppercase leading-tight tracking-[0.06em] transition-colors sm:text-xs", item.id === mode ? "border-brand-500 bg-brand-500 text-white shadow-[0_3px_9px_rgba(107,85,245,0.28)]" : "border-white bg-white text-neutral-600 hover:border-neutral-200 hover:text-neutral-900")}>
                    {item.label}
                  </button>
                ))}
            </div>
            <div key={mode} className="landing-search-card bg-white text-neutral-900 shadow-[0_8px_24px_rgba(17,24,39,0.24)]">
              <div className="mx-auto max-w-[31rem] px-7 pb-8 pt-8 sm:px-10">
                <p className="mb-6 text-center text-xl leading-relaxed text-neutral-600">I would like to find a home that fits me.</p>
                <div className="landing-sentence-filter">
                  <SentenceFilterBar />
                </div>
                <div className="mt-7 flex justify-center">
                  <button onClick={search} className="flex min-h-13 items-center gap-2 bg-accent px-9 text-sm font-extrabold uppercase tracking-[0.08em] text-neutral-900 transition-colors hover:bg-accent/90">
                    View properties <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <Link href="/search" className="flex items-center justify-between border-t border-neutral-200 bg-neutral-100 px-7 py-5 text-sm font-semibold text-neutral-600 hover:bg-neutral-200">
                <span className="flex items-center gap-3"><Building2 className="h-6 w-6" />Browse all homes on the map</span><ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 hidden border-t border-neutral-200 bg-white lg:block">
          <div className="mx-auto grid max-w-[96rem] grid-cols-3 divide-x divide-neutral-200 px-12">
            {tools.map((item) => {
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} className="flex min-h-24 items-center gap-4 px-7 text-sm font-extrabold uppercase tracking-[0.04em] text-brand-700 hover:bg-neutral-50"><Icon className="h-8 w-8 shrink-0 text-accent" />{item.label}<ChevronRight className="ml-auto h-4 w-4" /></Link>;
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
