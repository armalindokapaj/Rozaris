"use client";

import { Footer } from "@/components/layout/Footer";
import { useT } from "@/lib/i18n/useT";

export function LegalPageClient({
  topicKey,
  sectionCount,
}: {
  topicKey: "privacyPage" | "termsPage";
  sectionCount: number;
}) {
  const { t } = useT();

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600">
          {t("legal.lastUpdatedLabel")} — {t("legal.lastUpdatedDate")}
        </p>
        <h1 className="mt-1 font-serif text-3xl text-neutral-900 sm:text-4xl">{t(`${topicKey}.title`)}</h1>

        <p className="mt-3 rounded-card border border-warning/30 bg-warning/5 p-3.5 text-xs leading-relaxed text-neutral-600">
          {t("legal.draftNotice")}
        </p>

        <p className="mt-6 text-sm leading-relaxed text-neutral-600">{t(`${topicKey}.intro`)}</p>

        <div className="mt-6 space-y-6">
          {Array.from({ length: sectionCount }, (_, i) => i + 1).map((n) => (
            <section key={n}>
              <h2 className="font-serif text-lg text-neutral-900">{t(`${topicKey}.s${n}Title`)}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{t(`${topicKey}.s${n}Body`)}</p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-sm text-neutral-500">
          {t("legal.contactEmail")}
        </p>
      </div>

      <Footer />
    </div>
  );
}
