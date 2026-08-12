"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, MapPin } from "lucide-react";
import { JoinMenu } from "@/components/layout/JoinMenu";
import { Logo } from "@/components/layout/Logo";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type DiscoveryMode = "buy" | "rent" | "new";

const MODES: { id: DiscoveryMode; label: string; image: string; title: string; description: string }[] = [
  { id: "buy", label: "Buy", image: "/landing/hero-buy.png", title: "Find a place to call home.", description: "Explore verified homes and apartments across Albania and Kosovo." },
  { id: "rent", label: "Rental", image: "/landing/hero-rent.png", title: "Live where life happens.", description: "Find flexible rentals in the places you want to be." },
  { id: "new", label: "New developments", image: "/landing/hero-new.png", title: "Discover what is next.", description: "Explore new projects, availability and immersive 3D experiences." },
];

export function LandingHero() {
  const router = useRouter();
  const setFilters = useAppStore((s) => s.setFilters);
  const setTransaction = useAppStore((s) => s.setTransaction);
  const setMode = useAppStore((s) => s.setMode);
  const [mode, setDiscoveryMode] = useState<DiscoveryMode>("buy");
  const [market, setMarket] = useState<"Albania" | "Kosovo">("Albania");
  const [location, setLocation] = useState("");
  const active = MODES.find((item) => item.id === mode) ?? MODES[0];

  function search() {
    setMode("map");
    setTransaction(mode === "rent" ? "rent" : "buy");
    setFilters({
      location: location.trim() || (market === "Albania" ? "Tirana, Albania" : "Pristina, Kosovo"),
      projectsOnly: mode === "new",
    });
    router.push("/search");
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-neutral-900 text-white">
      {MODES.map((item) => (
        // eslint-disable-next-line @next/next/no-img-element -- decorative full-bleed hero art
        <img key={item.id} src={item.image} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-700", item.id === mode ? "opacity-100" : "opacity-0")} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-black/50" />

      <header className="relative z-10 flex items-center justify-between border-b border-white/20 px-5 py-5 sm:px-8 lg:px-12">
        <Logo className="text-xl tracking-[0.14em] text-white" />
        <JoinMenu variant="bare" />
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-76px)] max-w-7xl items-center px-5 py-12 sm:px-8 lg:px-12">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1fr_34rem]">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white/75">Property discovery, reimagined</p>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.04] sm:text-5xl lg:text-6xl">{active.title}</h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">{active.description}</p>
          </div>

          <div className="bg-white p-5 text-neutral-900 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
            <div className="flex border-b border-neutral-200">
              {MODES.map((item) => (
                <button key={item.id} onClick={() => setDiscoveryMode(item.id)} className={cn("border-b-2 px-3 py-3 text-xs font-bold uppercase tracking-[0.08em] transition-colors", mode === item.id ? "border-brand-500 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-900")}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="space-y-4 pt-6">
              <label className="block text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">Search in</label>
              <div className="grid grid-cols-2 gap-2">
                {(["Albania", "Kosovo"] as const).map((country) => <button key={country} onClick={() => setMarket(country)} className={cn("flex h-12 items-center justify-between border px-3 text-sm font-semibold", market === country ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500")}>{country}<MapPin className="h-4 w-4" /></button>)}
              </div>
              <label className="block text-xs font-bold uppercase tracking-[0.08em] text-neutral-500">City, neighborhood or project</label>
              <div className="flex h-12 items-center border border-neutral-300 bg-white px-3 focus-within:border-neutral-900">
                <input value={location} onChange={(event) => setLocation(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder={market === "Albania" ? "Tirana, Durrës, Vlora…" : "Pristina, Prizren, Peja…"} className="w-full bg-transparent text-base outline-none placeholder:text-neutral-400" />
                <ChevronDown className="h-4 w-4 text-neutral-400" />
              </div>
              <button onClick={search} className="flex h-12 w-full items-center justify-center gap-2 bg-brand-500 px-5 text-sm font-bold text-white hover:bg-brand-600">View properties <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
