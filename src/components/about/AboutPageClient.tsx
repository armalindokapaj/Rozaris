"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Handshake,
  LayoutDashboard,
  ListFilter,
  MapPin,
  MessageCircle,
  Palette,
  Rotate3d,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { HeroSketch } from "@/components/common/HeroSketch";
import { Footer } from "@/components/layout/Footer";
import { buttonVariants } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/useT";

/**
 * The long-form counterpart to Help Center's short "About ROZARIS" teaser
 * (`helpPage.about*` — kept as-is, its "Learn more about us" link now
 * points here). Static/marketing content, not searchable like Help's FAQ,
 * so it's plain <details> accordions grouped under real topic headings
 * instead of the filterable sidebar HelpPageClient uses.
 */

const PILLARS = [
  { icon: Rotate3d, titleKey: "pillar1Title", bodyKey: "pillar1Body" },
  { icon: Building2, titleKey: "pillar2Title", bodyKey: "pillar2Body" },
  { icon: ShieldCheck, titleKey: "pillar3Title", bodyKey: "pillar3Body" },
  { icon: ListFilter, titleKey: "pillar4Title", bodyKey: "pillar4Body" },
  { icon: Calculator, titleKey: "pillar5Title", bodyKey: "pillar5Body" },
  { icon: Palette, titleKey: "pillar6Title", bodyKey: "pillar6Body" },
  { icon: LayoutDashboard, titleKey: "pillar7Title", bodyKey: "pillar7Body" },
  { icon: ClipboardCheck, titleKey: "pillar8Title", bodyKey: "pillar8Body" },
] as const;

const AUDIENCE = [
  { icon: Search, titleKey: "audience1Title", bodyKey: "audience1Body" },
  { icon: Users, titleKey: "audience2Title", bodyKey: "audience2Body" },
  { icon: Handshake, titleKey: "audience3Title", bodyKey: "audience3Body" },
  { icon: Building2, titleKey: "audience4Title", bodyKey: "audience4Body" },
] as const;

const TRUST_POINTS = [
  { titleKey: "trustPoint1Title", bodyKey: "trustPoint1Body" },
  { titleKey: "trustPoint2Title", bodyKey: "trustPoint2Body" },
  { titleKey: "trustPoint3Title", bodyKey: "trustPoint3Body" },
  { titleKey: "trustPoint4Title", bodyKey: "trustPoint4Body" },
] as const;

const HOW_STEPS = [
  { icon: Rotate3d, titleKey: "how1Title", bodyKey: "how1Body" },
  { icon: Building2, titleKey: "how2Title", bodyKey: "how2Body" },
  { icon: ListFilter, titleKey: "how3Title", bodyKey: "how3Body" },
  { icon: MessageCircle, titleKey: "how4Title", bodyKey: "how4Body" },
] as const;

// Flat numbered keys (aboutPage.faqG{g}Q{n}/A{n}) — same convention
// HelpPageClient and LegalPageClient use, since useT()'s t() only does
// dot-path lookups, not arrays.
const FAQ_GROUPS = [
  { titleKey: "faqG1Title", count: 4 },
  { titleKey: "faqG2Title", count: 4 },
  { titleKey: "faqG3Title", count: 4 },
  { titleKey: "faqG4Title", count: 4 },
  { titleKey: "faqG5Title", count: 4 },
  { titleKey: "faqG6Title", count: 4 },
] as const;

export function AboutPageClient() {
  const { t } = useT();

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        {/* Hero */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600">
              {t("aboutPage.heroEyebrow")}
            </p>
            <h1 className="mt-1 font-serif text-4xl text-neutral-900 sm:text-5xl">{t("aboutPage.heroHeadline")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-neutral-500 sm:text-base">{t("aboutPage.heroSubtitle")}</p>
          </div>
          <HeroSketch className="hidden h-32 w-52 shrink-0 text-neutral-300 sm:block" />
        </div>

        {/* Mission */}
        <div className="mt-8 flex flex-col gap-4 rounded-panel bg-brand-50 p-5 sm:flex-row sm:items-start sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-brand-100 text-brand-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-xl text-neutral-900">{t("aboutPage.missionTitle")}</h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-neutral-600">{t("aboutPage.missionBody")}</p>
          </div>
        </div>

        {/* What ROZARIS is */}
        <section className="mt-10 max-w-3xl">
          <h2 className="font-serif text-2xl text-neutral-900">{t("aboutPage.whatTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">{t("aboutPage.whatBody")}</p>
        </section>

        {/* How it works */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl text-neutral-900">{t("aboutPage.howTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("aboutPage.howSubtitle")}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HOW_STEPS.map(({ icon: Icon, titleKey, bodyKey }) => (
              <div key={titleKey} className="rounded-card border border-neutral-200 bg-white p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-sm font-bold text-neutral-900">{t(`aboutPage.${titleKey}`)}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{t(`aboutPage.${bodyKey}`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Platform pillars */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl text-neutral-900">{t("aboutPage.pillarsTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("aboutPage.pillarsSubtitle")}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ icon: Icon, titleKey, bodyKey }) => (
              <div key={titleKey} className="rounded-card border border-neutral-200 bg-white p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-sm font-bold text-neutral-900">{t(`aboutPage.${titleKey}`)}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{t(`aboutPage.${bodyKey}`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl text-neutral-900">{t("aboutPage.audienceTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("aboutPage.audienceSubtitle")}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCE.map(({ icon: Icon, titleKey, bodyKey }) => (
              <div key={titleKey} className="rounded-card border border-neutral-200 bg-white p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-sm font-bold text-neutral-900">{t(`aboutPage.${titleKey}`)}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{t(`aboutPage.${bodyKey}`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust & verification */}
        <section className="mt-10 overflow-hidden rounded-panel border border-neutral-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-xl text-neutral-900">{t("aboutPage.trustTitle")}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">{t("aboutPage.trustBody")}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TRUST_POINTS.map(({ titleKey, bodyKey }) => (
              <div key={titleKey} className="border-t border-neutral-100 pt-3">
                <p className="text-sm font-bold text-neutral-900">{t(`aboutPage.${titleKey}`)}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{t(`aboutPage.${bodyKey}`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Where we are today */}
        <section className="mt-10 flex flex-col gap-4 rounded-panel bg-neutral-50 p-5 sm:flex-row sm:items-start sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-white text-brand-600">
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-xl text-neutral-900">{t("aboutPage.companyTitle")}</h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-neutral-600">{t("aboutPage.companyBody")}</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl text-neutral-900">{t("aboutPage.faqTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("aboutPage.faqSubtitle")}</p>

          <div className="mt-5 space-y-8">
            {FAQ_GROUPS.map(({ titleKey, count }) => (
              <div key={titleKey}>
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-brand-600">
                  <Compass className="h-3.5 w-3.5" />
                  {t(`aboutPage.${titleKey}`)}
                </h3>
                <div className="mt-2.5 space-y-2.5">
                  {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                    const gKey = titleKey.replace("Title", "");
                    return (
                      <details key={n} className="group rounded-card border border-neutral-200 bg-white">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-neutral-900">
                          {t(`aboutPage.${gKey}Q${n}`)}
                          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                        </summary>
                        <p className="px-4 pb-4 text-sm leading-relaxed text-neutral-600">
                          {t(`aboutPage.${gKey}A${n}`)}
                        </p>
                      </details>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 flex flex-col gap-4 rounded-panel border border-neutral-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-neutral-900">{t("aboutPage.ctaTitle")}</h2>
            <p className="mt-1 text-sm text-neutral-500">{t("aboutPage.ctaBody")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link href="/help" className={buttonVariants({ variant: "secondary" })}>
              {t("aboutPage.ctaHelpButton")}
            </Link>
            <Link href="/search" className={buttonVariants({ variant: "primary" })}>
              {t("aboutPage.ctaSearchButton")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <p className="mt-6 text-xs text-neutral-400">{t("helpPage.prototypeNote")}</p>
      </div>

      <Footer />
    </div>
  );
}
