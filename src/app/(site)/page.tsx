"use client";

import Link from "next/link";
import { Building2, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";
import { SearchBar } from "@/components/search/SearchBar";

// Placeholder marketing landing page for "/". The map + filters + results
// experience that used to live here now lives at /search (see PRD:
// ROZARIS_Landing_UIUX_PRD / ROZARIS_Search_UIUX_PRD). This page is a
// lightweight stand-in until the real landing page design is dropped in.

const STATS: { value: string; labelKey: string }[] = [
  { value: "12,450+", labelKey: "landing.statProperties" },
  { value: "1,250+", labelKey: "landing.statNewProjects" },
  { value: "8,500+", labelKey: "landing.statHappyClients" },
  { value: "320+", labelKey: "landing.statTrustedAgents" },
];

const FEATURES: { icon: typeof Sparkles; labelKey: string; bodyKey: string }[] = [
  { icon: Sparkles, labelKey: "landing.feature3dTitle", bodyKey: "landing.feature3dBody" },
  { icon: ShieldCheck, labelKey: "landing.featureTrustedTitle", bodyKey: "landing.featureTrustedBody" },
  { icon: Building2, labelKey: "landing.featureListingsTitle", bodyKey: "landing.featureListingsBody" },
  { icon: Star, labelKey: "landing.featureSaveTitle", bodyKey: "landing.featureSaveBody" },
];

export default function LandingPage() {
  const router = useRouter();
  const setTransaction = useAppStore((s) => s.setTransaction);
  const { t } = useT();

  return (
    <div className="min-h-full overflow-y-auto scroll-thin bg-neutral-0">
      <section className="relative overflow-hidden bg-neutral-900 px-4 py-20 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(109,91,246,0.35),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(109,91,246,0.25),transparent_40%)]"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
            {t("landing.heroSubtitle")}
          </p>

          <div className="mx-auto mt-8 max-w-xl">
            <SearchBar />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {(["buy", "rent"] as const).map((txn) => (
              <button
                key={txn}
                onClick={() => {
                  setTransaction(txn);
                  router.push("/search");
                }}
                className="rounded-pill border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                {txn === "buy" ? t("nav.buy") : t("nav.rent")}
              </button>
            ))}
            <Link
              href="/search"
              className="rounded-pill bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              {t("landing.browseAll")}
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-100 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, labelKey, bodyKey }) => (
            <div key={labelKey} className="rounded-card border border-neutral-100 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-3 text-sm font-bold text-neutral-900">{t(labelKey)}</h3>
              <p className="mt-1 text-sm text-neutral-500">{t(bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-4">
          {STATS.map(({ value, labelKey }) => (
            <div key={labelKey} className="text-center">
              <p className="text-2xl font-bold text-neutral-900">{value}</p>
              <p className="mt-1 text-sm text-neutral-500">{t(labelKey)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
