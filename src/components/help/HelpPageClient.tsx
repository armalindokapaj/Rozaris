"use client";

import { useState } from "react";
import { Box, Mail, MessageCircle, Rotate3d, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/useT";

const CONTACT_EMAIL = "hello@rozaris.al";
const FAQ_KEYS = ["faq1", "faq2", "faq3", "faq4", "faq5"];

export function HelpPageClient() {
  const { t } = useT();
  const [copiedAt, setCopiedAt] = useState<{ x: number; y: number } | null>(null);

  async function handleEmailClick(e: React.MouseEvent<HTMLButtonElement>) {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopiedAt({ x: e.clientX, y: e.clientY });
    window.setTimeout(() => setCopiedAt(null), 1400);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <h1 className="text-2xl font-bold text-neutral-900">{t("helpPage.title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("helpPage.subtitle")}</p>

      <section id="3d-map" className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Rotate3d className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-neutral-900">{t("helpPage.mapTitle")}</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{t("helpPage.mapBody")}</p>
      </section>

      <section className="mt-8 space-y-3">
        {FAQ_KEYS.map((key) => (
          <details key={key} className="group rounded-card border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">
              {t(`helpPage.${key}Q`)}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{t(`helpPage.${key}A`)}</p>
          </details>
        ))}
      </section>

      <section id="about" className="mt-10 rounded-panel border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <h2 className="text-base font-bold text-neutral-900">{t("helpPage.aboutTitle")}</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{t("helpPage.aboutBody")}</p>
      </section>

      <section id="contact" className="mt-8 rounded-panel border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold text-neutral-900">{t("helpPage.contactTitle")}</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <button
            type="button"
            onClick={handleEmailClick}
            className="flex w-fit items-center gap-2 text-neutral-600 hover:text-brand-600"
          >
            <Mail className="h-4 w-4" /> {CONTACT_EMAIL}
          </button>
          <a
            href="https://wa.me/355691234567"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-neutral-600 hover:text-brand-600"
          >
            <MessageCircle className="h-4 w-4" /> {t("helpPage.contactWhatsapp")}
          </a>
        </div>
      </section>

      <p className="mt-8 flex items-center gap-1.5 text-xs text-neutral-400">
        <Box className="h-3.5 w-3.5" />
        {t("helpPage.prototypeNote")}
      </p>

      {copiedAt && (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg"
          style={{ left: copiedAt.x, top: copiedAt.y - 8 }}
        >
          {t("helpPage.emailCopied")}
        </span>
      )}
    </div>
  );
}
